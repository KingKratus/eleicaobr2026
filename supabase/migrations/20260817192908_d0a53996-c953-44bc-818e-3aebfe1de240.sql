select cron.schedule(
  'revalidar-chaves-tse-diario',
  '20 6 * * *',
  $$
  select net.http_post(
    url := 'https://project--3ef4b69c-e98e-4096-a7a4-281944494fef.lovable.app/api/public/hooks/revalidar-chaves',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);