-- Read-only verification. Run this file in Supabase Dashboard -> SQL Editor.

-- Expected: total_chunks = 60, files = 5, dimensions = 1024.
select
  count(*) as total_chunks,
  count(distinct file) as files,
  min(extensions.vector_dims(embedding)) as min_dimensions,
  max(extensions.vector_dims(embedding)) as max_dimensions
from public.knowledge_chunks;

-- Expected: five rows, each with chunk_count = 12.
select
  file,
  count(*) as chunk_count
from public.knowledge_chunks
group by file
order by file;

-- Expected: one row for the dairy-free high-protein recipe.
select
  id,
  file,
  heading,
  left(content, 240) as content_preview,
  extensions.vector_dims(embedding) as embedding_dimensions
from public.knowledge_chunks
where file = 'recipes.md'
  and heading = 'Высокобелковый ужин без молочки';

-- Expected: zero rows. Any result here means ingest created a duplicate section.
select
  file,
  heading,
  count(*) as occurrences
from public.knowledge_chunks
group by file, heading
having count(*) > 1
order by file, heading;
