TRUNCATE TABLE
  public.chat_messages,
  public.chat_threads,
  public.investor_offers,
  public.offer_distributions,
  public.documents,
  public.properties,
  public.contact_events,
  public.call_queue,
  public.automation_events,
  public.client_profiles,
  public.loan_applications,
  public.clients,
  public.institutional_investor_settings,
  public.investors
RESTART IDENTITY CASCADE;