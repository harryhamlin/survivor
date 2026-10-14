import React, { useEffect, useRef, useState } from 'react';
import loadLeaflet from './utils/loadLeaflet';
import { lists } from './data/copenhagenLists';
import Recommendations from './Recommendations';
import { useSearchParams } from 'react-router';

// Include the northern museum trips and every saved branch in the map area.
const allPlaces = Object.values(lists).flatMap((list) => list.places);
const guideBounds = [
  [Math.min(...allPlaces.map((place) => place.lat)) - 0.05, Math.min(...allPlaces.map((place) => place.lon)) - 0.05],
  [Math.max(...allPlaces.map((place) => place.lat)) + 0.05, Math.max(...allPlaces.map((place) => place.lon)) + 0.05],
];

export default function Copenhagen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedList = searchParams.get('list');
  const listKey = Object.prototype.hasOwnProperty.call(lists, requestedList) ? requestedList : 'food';
  const currentList = lists[listKey];
  const places = currentList.places;
  const coffeeSelected = listKey === 'coffee';
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const tilesRef = useRef(null);
  const placeLayersRef = useRef(null);
  const dialogRef = useRef(null);
  const navRef = useRef(null);
  const menuButtonRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mapError, setMapError] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current.focus();
      } else if (event.type === 'pointerdown' && !navRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [menuOpen]);

  useEffect(() => {
    let map;
    let resizeObserver;
    let resizeFrame;
    let cancelled = false;
    setMapReady(false);
    setMapError(false);
    setTileError(false);
    loadLeaflet().then((L) => {
      if (cancelled || !mapEl.current) return;
      leafletRef.current = L;
      map = L.map(mapEl.current, {
        center: [55.68, 12.57],
        zoom: 12,
        minZoom: 8,
        maxZoom: 20,
        maxBounds: guideBounds,
        maxBoundsViscosity: 0.6,
        scrollWheelZoom: true,
        touchZoom: 'center',
        bounceAtZoomLimits: false,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });
      mapRef.current = map;
      placeLayersRef.current = L.layerGroup().addTo(map);
      const locationLayers = L.layerGroup().addTo(map);
      map.on('locationfound', (event) => {
        if (cancelled) return;
        setLocating(false);
        locationLayers.clearLayers();
        if (!L.latLngBounds(map.options.maxBounds).contains(event.latlng)) {
          setLocationStatus('You’re outside this Copenhagen map area. The saved places are still available below.');
          return;
        }
        L.circle(event.latlng, {
          radius: event.accuracy,
          color: '#e53935', weight: 1, fillOpacity: 0.12,
          interactive: false,
        }).addTo(locationLayers);
        L.circleMarker(event.latlng, {
          radius: 8, color: '#fff', weight: 3,
          fillColor: '#e53935', fillOpacity: 1,
        }).addTo(locationLayers).bindTooltip('You are here');
        map.stop();
        map.setView(event.latlng, 15, { animate: false });
        setLocationStatus(`Location found · accuracy approximately ${Math.round(event.accuracy)} m. The red dot marks your location.`);
      });
      map.on('locationerror', (event) => {
        if (cancelled) return;
        setLocating(false);
        const messages = {
          1: 'Location access was denied. Allow location access in your browser settings, then try again.',
          2: 'Your location is unavailable. Check your device’s location services and try again.',
          3: 'Finding your location timed out. Please try again.',
        };
        setLocationStatus(messages[event.code] || 'Your location could not be found. Please try again.');
      });
      let failedTiles = false;
      tilesRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 19,
        maxZoom: 20,
        keepBuffer: 2,
        className: 'copenhagen-map-tile',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on('loading', () => { failedTiles = false; })
        .on('tileerror', () => {
          failedTiles = true;
          if (!cancelled) setTileError(true);
        })
        .on('load', () => { if (!cancelled) setTileError(failedTiles); })
        .addTo(map);

      // Mobile browser chrome, rotation, and list text can change the map size.
      const refreshSize = () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (!cancelled) map.invalidateSize({ pan: false, debounceMoveend: true });
        });
      };
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(refreshSize);
        resizeObserver.observe(mapEl.current);
      }
      refreshSize();
      setMapReady(true);
    }).catch(() => { if (!cancelled) setMapError(true); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(resizeFrame);
      if (resizeObserver) resizeObserver.disconnect();
      mapRef.current = null;
      leafletRef.current = null;
      tilesRef.current = null;
      placeLayersRef.current = null;
      if (map) {
        map.stopLocate();
        map.remove();
      }
    };
  }, [mapAttempt]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !placeLayersRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const layers = placeLayersRef.current;
    layers.clearLayers();
    places.forEach((place) => {
      const label = document.createElement('span');
      label.className = 'copenhagen-pin-label';
      label.textContent = place.shortName || place.name;
      // Separate labels when the source puts multiple venues at the same address.
      const colocated = places.filter((other) => other.lat === place.lat && other.lon === place.lon);
      if (colocated.length > 1) {
        const index = colocated.indexOf(place);
        label.style.left = index % 2 ? '18px' : '-6px';
        label.style.transform = index % 2 ? 'none' : 'translateX(-100%)';
        label.style.bottom = `${16 + Math.floor(index / 2) * 32}px`;
      }
      const icon = L.divIcon({
        className: `copenhagen-pin${place.priority ? ' priority' : ''}${place.shared ? ' shared' : ''}`,
        html: label,
        iconSize: [12, 12], iconAnchor: [6, 6],
      });
      L.marker([place.lat, place.lon], { icon, alt: place.name })
        .addTo(layers)
        .on('click', () => setSelected(place));
    });
    map.stop();
    map.invalidateSize({ pan: false });
    map.fitBounds(places.map((place) => [place.lat, place.lon]), { padding: [60, 40], maxZoom: 15, animate: false });
  }, [places, mapReady]);

  useEffect(() => {
    if (selected && !dialogRef.current.open) dialogRef.current.showModal();
  }, [selected]);

  const close = () => {
    dialogRef.current.close();
    setSelected(null);
  };

  const select = (place) => {
    if (mapRef.current) {
      mapRef.current.stop();
      mapRef.current.setView([place.lat, place.lon], 15, { animate: false });
    }
    setSelected(place);
  };

  const showAll = () => {
    const map = mapRef.current;
    if (!map) return;
    map.stop();
    map.invalidateSize({ pan: false });
    map.fitBounds(places.map((place) => [place.lat, place.lon]), { padding: [60, 40], maxZoom: 15, animate: false });
  };

  const reloadMap = () => {
    if (!mapRef.current || mapError) {
      setMapAttempt((attempt) => attempt + 1);
      return;
    }
    mapRef.current.stop();
    mapRef.current.invalidateSize({ pan: false });
    tilesRef.current.redraw();
  };

  const findMe = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Your browser does not support location access.');
      return;
    }
    if (!window.isSecureContext) {
      setLocationStatus('Location access requires HTTPS or localhost.');
      return;
    }
    if (!mapRef.current || locating) return;
    setLocating(true);
    setLocationStatus('Finding your location…');
    mapRef.current.locate({
      setView: false, watch: false, enableHighAccuracy: true,
      timeout: 15000, maximumAge: 0,
    });
  };

  return (
    <main className="page-main coffee-page" id="copenhagen">
      <nav className="site-nav copenhagen-nav" aria-label="Copenhagen lists" ref={navRef}>
        <span className="brand">Copenhagen</span>
        <span className="copenhagen-active-list">{currentList.label}</span>
        <button className="nav-burger" ref={menuButtonRef} aria-label="Choose a list" aria-expanded={menuOpen} aria-controls="copenhagen-list-menu" onClick={() => setMenuOpen((open) => !open)}>
          <span /><span /><span />
        </button>
        <div id="copenhagen-list-menu" className={`copenhagen-nav-lists${menuOpen ? ' open' : ''}`}>
          {Object.entries(lists).map(([key, list]) => (
            <button
              key={key}
              className={`nav-link${key === listKey ? ' active' : ''}`}
              aria-pressed={key === listKey}
              onClick={() => {
                close();
                setMenuOpen(false);
                setSearchParams({ list: key }, { replace: true });
              }}
            >{list.label}</button>
          ))}
        </div>
      </nav>
      <Recommendations activeList={listKey} />
      <section className="page-section">
        <h2 className="section-label">{currentList.mapTitle || `Copenhagen ${currentList.label} Map`}</h2>
        <p>{currentList.description}</p>
        {currentList.sourceUrl && <p><a href={currentList.sourceUrl} target="_blank" rel="noopener noreferrer">{currentList.sourceLabel || 'Original Google Maps list'} ↗</a></p>}
        <p className="exmap-hint">Click a named pin for details · scroll or drag to explore</p>
        <div className="coffee-legend">
          <span><i className="shared" />Appears in multiple lists</span>
          {coffeeSelected && <>
            <span><i className="priority" />High priority</span>
            <span><i />Other worthwhile roasters</span>
          </>}
        </div>
        <div className="coffee-location-controls">
          <button className="coffee-find-me" onClick={findMe} disabled={!mapReady || locating}>
            {locating ? 'Finding you…' : 'Find me'}
          </button>
          <button className="coffee-find-me" onClick={showAll} disabled={!mapReady}>Show all</button>
          <p role="status" aria-live="polite">{locationStatus}</p>
        </div>
        {(mapError || tileError) && <div className="coffee-location-controls">
          <p role="status">{mapError ? 'The map could not load.' : 'Some map tiles could not load.'} All places are still listed below.</p>
          <button className="coffee-find-me" onClick={reloadMap}>Reload map</button>
        </div>}
        <div className="exmap-leaflet coffee-map" ref={mapEl} aria-label={`Map of Copenhagen ${currentList.label.toLowerCase()} places`} />
      </section>
      {(coffeeSelected ? [true, false] : [false]).map((priority) => (
        <section className="page-section" key={String(priority)}>
          <h2 className="section-label">{coffeeSelected ? (priority ? 'High Priority' : 'Other Worthwhile Roasters') : (currentList.sectionTitle || currentList.label)}</h2>
          <div className="coffee-list">
            {places.filter((place) => place.priority === priority).map((place) => (
              <button className={`coffee-row${place.shared ? ' shared' : ''}`} key={place.id} onClick={() => select(place)}>
                <span className={`coffee-number${priority ? ' priority' : ''}${place.shared ? ' shared' : ''}`}>{place.id}</span>
                <span>
                  <span className="coffee-name">{place.name}</span>
                  <span className="coffee-address">{place.address || 'Address on Google Maps'}{place.area && ` · ${place.area}`}</span>
                  {place.detail && <span className="coffee-detail">{place.detail}</span>}
                  {place.note && <span className="coffee-note">{place.note}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <dialog className="coffee-dialog" ref={dialogRef} onCancel={close} onClose={() => setSelected(null)} onClick={(event) => {
        if (event.target === dialogRef.current) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        }
      }} aria-labelledby="coffee-detail-title">
        {selected && <>
          <button className="coffee-close" onClick={close} aria-label="Close details" autoFocus>×</button>
          <p className="section-label">{coffeeSelected ? (selected.priority ? 'High Priority' : 'Other Worthwhile Roaster') : (currentList.sectionTitle || currentList.label)} · {selected.id}</p>
          <h2 id="coffee-detail-title">{selected.name}</h2>
          <p className="coffee-memberships"><strong>Appears in:</strong> {selected.memberships.map((list) => list.label).join(' · ')}</p>
          {(selected.address || selected.area) && <p>{selected.address}{selected.area && <><br />{selected.area}</>}</p>}
          {selected.detail && <p className="coffee-detail">{selected.detail}</p>}
          {(selected.websiteUrl || selected.descriptionUrl) && <p><a href={selected.websiteUrl || selected.descriptionUrl} target="_blank" rel="noopener noreferrer">{selected.websiteUrl ? 'Visit website' : 'About this place'} ↗</a></p>}
          {selected.mapsUrl && <p><a href={selected.mapsUrl} target="_blank" rel="noopener noreferrer">View place on Google Maps ↗</a></p>}
          {selected.note && <p className="coffee-note">{selected.note}</p>}
        </>}
      </dialog>
    </main>
  );
}
