begin;

truncate table public.knowledge_chunks;

drop index if exists public.knowledge_chunks_embedding_hnsw_idx;

alter table public.knowledge_chunks
  alter column embedding type extensions.vector(1024);

create index knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1024),
  match_count integer default 5
)
returns table (
  file text,
  heading text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    knowledge_chunks.file,
    knowledge_chunks.heading,
    knowledge_chunks.content,
    1 - (knowledge_chunks.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks
  order by knowledge_chunks.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 5), 20));
$$;

revoke all on function public.match_knowledge_chunks(extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(extensions.vector, integer)
  to service_role;

commit;
