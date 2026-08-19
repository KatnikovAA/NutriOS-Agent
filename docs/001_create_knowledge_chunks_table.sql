create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_chunks (
  id bigint generated always as identity primary key,
  file text not null,
  heading text not null,
  content text not null,
  embedding extensions.vector(1536) not null
);

alter table public.knowledge_chunks enable row level security;

create index if not exists knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
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
