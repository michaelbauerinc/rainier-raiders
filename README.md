# Rainier Raiders

A monorepo for the Rainier Raiders World of Warcraft Forever guild.

## Local development

With Docker running, start the website and PostgreSQL:

```sh
make website:dev
```

Open http://localhost:3000. Stop with `make website:down`; database data is preserved.
