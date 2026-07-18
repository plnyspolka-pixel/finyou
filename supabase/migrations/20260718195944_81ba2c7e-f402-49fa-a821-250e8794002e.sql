do $$
declare r record;
begin
  for r in
    select psid_lead.id as psid_lead_id,
           main_lead.id as main_lead_id,
           psid_lead.messenger_psid as psid,
           psid_lead.instagram_igsid as igsid,
           psid_lead.application_data as psid_app_data
    from leads psid_lead
    join leads main_lead
      on main_lead.phone_normalized = psid_lead.phone_normalized
     and main_lead.id <> psid_lead.id
     and main_lead.messenger_psid is null
     and (main_lead.first_name is not null or main_lead.email is not null)
    where psid_lead.messenger_psid is not null
      and psid_lead.first_name is null
      and psid_lead.phone_normalized is not null
  loop
    update lead_communications set lead_id = r.main_lead_id where lead_id = r.psid_lead_id;
    update leads
       set messenger_psid = coalesce(messenger_psid, r.psid),
           instagram_igsid = coalesce(instagram_igsid, r.igsid),
           application_data = coalesce(application_data, '{}'::jsonb) || coalesce(r.psid_app_data, '{}'::jsonb)
     where id = r.main_lead_id;
    delete from leads where id = r.psid_lead_id;
  end loop;
end$$;