import React, { useEffect, useRef, useState } from 'react';

const endpoint = '/api/copenhagen/recommend';
const safeLink = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};

function answerText(blocks) {
  const text = blocks.map((block) => block.text).join('');
  // Parse before adding citations, which can split a Markdown link across blocks.
  const pattern = /\[([^\]\n]+)\]\((<?https?:\/\/[^\s<>]*(?:\([^\s<>]*\)[^\s<>]*)?)>?\)/g;
  const parts = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index), end: match.index });
    parts.push({ text: match[1], href: safeLink(match[2].replace(/^</, '')), end: match.index + match[0].length });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), end: text.length });
  let blockEnd = 0;
  const citations = blocks.map((block) => ({ end: blockEnd += block.text.length, ids: block.citations || [] }));
  let start = 0;
  return parts.flatMap((part) => {
    const items = [];
    const within = citations.filter((citation) => citation.end >= start && citation.end <= part.end);
    if (part.href) {
      items.push({ ...part });
      for (const citation of within) items.push({ citations: citation.ids });
    } else {
      let cursor = start;
      for (const citation of within) {
        items.push({ text: part.text.slice(cursor - start, citation.end - start) }, { citations: citation.ids });
        cursor = citation.end;
      }
      items.push({ text: part.text.slice(cursor - start) });
    }
    citations.splice(0, within.length);
    start = part.end;
    return items;
  });
}

export function Answer({ answer }) {
  const sources = (answer.sources || []).filter((source) => safeLink(source.url));
  return <div className="recommendation-answer">
    <p className="recommendation-speaker">ChatGPT</p>
    <div className="recommendation-text">
      {answerText(answer.blocks).map((part, index) => <React.Fragment key={index}>
        {part.href ? <a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a> : part.text}
        {(part.citations || []).map((id) => {
          const source = sources.find((source) => source.id === id);
          return source && <sup key={id}><a href={source.url} title={source.title} aria-label={`Source ${id}: ${source.title}`} target="_blank" rel="noopener noreferrer">[{id}]</a></sup>;
        })}
      </React.Fragment>)}
    </div>
    {sources.length > 0 && <div className="recommendation-sources" aria-label="Answer sources">
      {sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.title} ↗</a>)}
    </div>}
    {answer.warning && <p className="recommendation-warning">{answer.warning}</p>}
  </div>;
}

export default function Recommendations({ activeList }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const controllerRef = useRef(null);
  const questionRef = useRef(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const ask = async (event) => {
    event.preventDefault();
    if (pending || !question.trim()) return;
    const asked = question.trim();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 100000);
    setPending(true);
    setError('');
    try {
      const history = conversation.flatMap((turn) => [
        { role: 'user', content: turn.question },
        { role: 'assistant', content: turn.answer.blocks.map((block) => block.text).join('').slice(0, 4000) },
      ]).slice(-6);
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ question: asked, activeList, history }),
      });
      let answer;
      try { answer = response.ok ? await readAnswer(response) : await response.json(); } catch (error) { throw new Error(error.message || 'Recommendations are unavailable right now. Please try again later.'); }
      if (!response.ok) throw new Error(answer.error || 'Could not get a recommendation. Please try again.');
      if (!Array.isArray(answer.blocks) || !answer.blocks.length || answer.blocks.some((block) => typeof block.text !== 'string')) {
        throw new Error('The answer was incomplete. Please try again.');
      }
      if (controller.signal.aborted) return;
      setConversation((turns) => [...turns, { question: asked, answer }]);
      setQuestion('');
      requestAnimationFrame(() => questionRef.current?.focus());
    } catch (error) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === 'timeout') setError('The search took too long. Please try a narrower question.');
      } else setError(error.message || 'Could not reach the recommendation service. Please try again.');
    } finally {
      clearTimeout(timeout);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  };

  return <section className="page-section recommendation-section">
    <h2>
      <button className="recommendation-toggle" onClick={() => setOpen((open) => !open)} aria-expanded={open} aria-controls="copenhagen-recommendations">
        Recommend something to me <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
    </h2>
    {open && <div id="copenhagen-recommendations" className="recommendation-panel">
      <p>Ask ChatGPT about coffee, food, museums, or a plan for your day. It uses all the saved lists and searches the web for relevant details.</p>
      {conversation.length > 0 && <div className="recommendation-conversation" aria-label="Recommendation conversation">
        {conversation.map((turn, index) => <div className="recommendation-turn" key={index}>
          <p className="recommendation-question"><strong>You</strong><br />{turn.question}</p>
          <Answer answer={turn.answer} />
        </div>)}
      </div>}
      <form onSubmit={ask}>
        <label htmlFor="recommendation-question">{conversation.length ? 'Ask a follow-up' : 'What are you looking for?'}</label>
        <textarea id="recommendation-question" ref={questionRef} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} disabled={pending} placeholder="Where should I go for light-roast filter coffee and a pastry near Nørrebro?" />
        <div className="recommendation-actions">
          <button className="coffee-find-me" type="submit" disabled={pending || !question.trim()}>{pending ? 'Looking into it…' : 'Ask ChatGPT'}</button>
          {pending && <button type="button" className="recommendation-secondary" onClick={() => controllerRef.current?.abort()}>Cancel</button>}
          {conversation.length > 0 && !pending && <button type="button" className="recommendation-secondary" onClick={() => { setConversation([]); setError(''); }}>New conversation</button>}
        </div>
      </form>
      {pending && <p className="recommendation-status" role="status">Checking the saved lists and searching the web…</p>}
      {error && <p className="recommendation-error" role="alert">{error}</p>}
    </div>}
  </section>;
}

async function readAnswer(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = event.split('\n').find(line => line.startsWith('data: '));
        if (!data) continue;
        const message = JSON.parse(data.slice(6));
        if (message.error) throw new Error(message.error);
        if (message.blocks) return message;
      }
      if (done) throw new Error('The answer was incomplete. Please try again.');
    }
  } finally { await reader.cancel().catch(() => {}); }
}
