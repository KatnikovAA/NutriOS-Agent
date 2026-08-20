-- Read-only Logs Explorer query.
-- Run this file in Supabase Dashboard -> Logs -> Logs Explorer, not in SQL Editor.
-- Expected after a RAG request: POST rows whose path contains
-- /rest/v1/rpc/match_knowledge_chunks and whose response status is 2xx.

select
  timestamp,
  request.method,
  request.path,
  response.status_code
from edge_logs
cross join unnest(metadata) as metadata
cross join unnest(metadata.request) as request
cross join unnest(metadata.response) as response
where request.path like '%/rest/v1/rpc/match_knowledge_chunks%'
order by timestamp desc
limit 20;
