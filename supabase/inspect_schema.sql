-- READ-ONLY. Paste into the Supabase SQL editor and send back the single JSON cell it returns.
-- Describes every table the driver module touches or the dispatcher already queries:
-- columns (type, nullability, default, enum values), constraints (PK/FK/unique/check), indexes,
-- RLS on/off, policies and triggers. Edit the list below if you want other tables included.

with t(name) as (
  values ('orders'), ('assigned_orders'), ('vehicles'), ('outlets'), ('profiles'), ('drivers'),
         ('order_events'), ('district_travel'), ('service_allowance')
),
cols as (
  select c.table_name,
         jsonb_agg(jsonb_build_object(
           'column', c.column_name,
           'type', case when c.data_type = 'USER-DEFINED' then c.udt_name else c.data_type end,
           'enum_values', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                             from pg_type ty join pg_enum e on e.enumtypid = ty.oid where ty.typname = c.udt_name),
           'nullable', c.is_nullable = 'YES',
           'default', c.column_default
         ) order by c.ordinal_position) as columns
    from information_schema.columns c join t on t.name = c.table_name
   where c.table_schema = 'public'
   group by c.table_name
),
cons as (
  select cl.relname as table_name,
         jsonb_agg(jsonb_build_object('name', co.conname, 'definition', pg_get_constraintdef(co.oid)) order by co.conname) as constraints
    from pg_constraint co
    join pg_class cl on cl.oid = co.conrelid
    join t on t.name = cl.relname
   where co.connamespace = 'public'::regnamespace
   group by cl.relname
),
idx as (
  select i.tablename as table_name, jsonb_agg(i.indexdef order by i.indexname) as indexes
    from pg_indexes i join t on t.name = i.tablename
   where i.schemaname = 'public'
   group by i.tablename
),
rls as (
  select cl.relname as table_name, cl.relrowsecurity as rls_enabled
    from pg_class cl join t on t.name = cl.relname
   where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r'
),
pol as (
  select p.tablename as table_name,
         jsonb_agg(jsonb_build_object('name', p.policyname, 'command', p.cmd, 'roles', p.roles, 'using', p.qual, 'with_check', p.with_check) order by p.policyname) as policies
    from pg_policies p join t on t.name = p.tablename
   where p.schemaname = 'public'
   group by p.tablename
),
trg as (
  select cl.relname as table_name,
         jsonb_agg(jsonb_build_object('name', tg.tgname, 'definition', pg_get_triggerdef(tg.oid)) order by tg.tgname) as triggers
    from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid join t on t.name = cl.relname
   where cl.relnamespace = 'public'::regnamespace and not tg.tgisinternal
   group by cl.relname
)
select jsonb_pretty(jsonb_object_agg(
  t.name,
  jsonb_build_object(
    'exists', rls.table_name is not null,
    'rls_enabled', rls.rls_enabled,
    'columns', coalesce(cols.columns, '[]'::jsonb),
    'constraints', coalesce(cons.constraints, '[]'::jsonb),
    'indexes', coalesce(idx.indexes, '[]'::jsonb),
    'policies', coalesce(pol.policies, '[]'::jsonb),
    'triggers', coalesce(trg.triggers, '[]'::jsonb)
  )
)) as schema
from t
left join rls  on rls.table_name  = t.name
left join cols on cols.table_name = t.name
left join cons on cons.table_name = t.name
left join idx  on idx.table_name  = t.name
left join pol  on pol.table_name  = t.name
left join trg  on trg.table_name  = t.name;
