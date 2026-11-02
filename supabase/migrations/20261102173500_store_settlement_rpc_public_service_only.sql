-- PostgREST exposes public, not private. This RPC executes only for service_role,
-- with invoker rights and an atomic row lock. Never grant to anon/authenticated.
create or replace function public.fulfill_store_order(_order_id uuid, _transaction_id text, _paid_grosz integer)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare o public.store_orders%rowtype;
declare item jsonb;
declare k text;
declare ident text;
begin
  select * into o from public.store_orders where id = _order_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status = 'paid' then
    if o.provider_transaction_id <> _transaction_id or o.amount_grosz <> _paid_grosz then
      return jsonb_build_object('ok', false, 'reason', 'already_paid_mismatch');
    end if;
    return jsonb_build_object('ok', true, 'alreadyProcessed', true);
  end if;
  if o.status not in ('created','pending') or o.currency <> 'PLN'
     or o.amount_grosz <> _paid_grosz or _paid_grosz < 1
     or (o.provider_transaction_id is not null and o.provider_transaction_id <> _transaction_id) then
    update public.store_orders set status = 'review', updated_at = now()
       where id = _order_id and status in ('created','pending');
    return jsonb_build_object('ok', false, 'reason', 'payment_mismatch');
  end if;
  for item in select * from pg_catalog.jsonb_array_elements(o.items)
  loop
    k := item ->> 'kind'; ident := item ->> 'id';
    if k not in ('lesson','course','document','kw') or ident is null or length(ident) > 100 then
      raise exception 'invalid trusted purchase snapshot';
    end if;
    insert into public.store_entitlements(user_id,item_kind,item_id,source_order_id)
    values (o.user_id,k,ident,o.id)
    on conflict (user_id,item_kind,item_id) do nothing;
  end loop;
  update public.store_orders
     set status='paid', provider_transaction_id=_transaction_id,
         paid_at=coalesce(paid_at,now()),updated_at=now()
   where id = _order_id;
  return jsonb_build_object('ok', true, 'alreadyProcessed', false);
end;
$$;

revoke all on function public.fulfill_store_order(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.fulfill_store_order(uuid,text,integer) to service_role;
drop function if exists private.fulfill_store_order(uuid,text,integer);
