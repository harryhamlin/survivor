# Heroku process types. `release` runs automatically after every deploy,
# before web dynos restart — this is what applies db/schema.sql to Heroku
# Postgres so a fresh deploy never ends up with an empty database.
release: node db/migrate.mjs
web: npm start
