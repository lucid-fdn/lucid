# Migration init container — applies base schema + incremental migrations
FROM postgres:16-alpine

COPY docker/bootstrap/ /bootstrap/
COPY supabase/migrations/ /migrations/
COPY docker/migrate/run.sh /run.sh

RUN chmod +x /run.sh

ENTRYPOINT ["/run.sh"]
