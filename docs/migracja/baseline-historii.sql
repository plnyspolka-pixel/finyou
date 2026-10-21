-- Baseline historii migracji w NOWEJ bazie — wygenerowane przez docs/migracja/baseline-historii.py
-- wersje w bazie: 231; w repo: 304; wspólne: 23; do usunięcia: 208
-- Uruchamiać przez konektor Supabase jako postgres (DELETE wymaga potwierdzenia) albo w panelu SQL.
-- Kolejność: 1 archiwum → 2 DELETE → 3 INSERT → 4 kontrola. Każdy krok idempotentny.

-- 1) Archiwum dotychczasowej historii (ginie razem z `drop schema _mig cascade` przy sprzątaniu;
--    oryginał pozostaje w starej bazie produkcyjnej).
create schema if not exists _mig;
create table if not exists _mig.lovable_schema_migrations as
  select *, now() as archived_at from supabase_migrations.schema_migrations;

-- 2) DESTRUKCYJNE: usunięcie 208 wersji Lovable, których nie ma w repo
delete from supabase_migrations.schema_migrations
 where version not in ('20260518124329', '20260518124401', '20260519073941', '20260519073952', '20260519075715', '20260519111620', '20260519142312', '20260519203350', '20260519203447', '20260519203522', '20260526115114', '20260526203320', '20260526232558', '20260526233833', '20260527003234', '20260527161315', '20260527203521', '20260528112056', '20260528115241', '20260528115620', '20260528120801', '20260528122142', '20260528165729', '20260528182256', '20260528192627', '20260528205257', '20260528214949', '20260528225652', '20260528234220', '20260601105710', '20260601145135', '20260601164344', '20260601180517', '20260601182540', '20260601195506', '20260601202039', '20260601214353', '20260602142307', '20260602142659', '20260602143404', '20260602143639', '20260602144203', '20260602144602', '20260602145239', '20260602145555', '20260602150006', '20260602151332', '20260602152221', '20260602154609', '20260602155237', '20260602160132', '20260602160245', '20260602170159', '20260602171637', '20260602195652', '20260602203232', '20260602204417', '20260604110826', '20260604191654', '20260604192735', '20260608080910', '20260608081720', '20260608082656', '20260608095337', '20260608103556', '20260608130744', '20260608150000', '20260608152139', '20260608165242', '20260608172813', '20260608174941', '20260608223322', '20260608230655', '20260608230743', '20260608235511', '20260609080012', '20260609082926', '20260609091620', '20260609100040', '20260609125515', '20260609131225', '20260609181836', '20260609182048', '20260609222247', '20260609223703', '20260610122834', '20260610130347', '20260610131007', '20260610153949', '20260613024657', '20260615114128', '20260615114233', '20260618135320', '20260618135921', '20260618152223', '20260618154755', '20260619070937', '20260619133711', '20260621194033', '20260623153029', '20260624141157', '20260624233124', '20260624234251', '20260624234935', '20260625204535', '20260625231919', '20260625232527', '20260626002442', '20260626012023', '20260626071514', '20260626111610', '20260626130000', '20260626130100', '20260626130200', '20260626130300', '20260626133033', '20260626133131', '20260629115221', '20260629115424', '20260629115507', '20260629115544', '20260629124734', '20260629141057', '20260629143343', '20260629145430', '20260629162531', '20260629174733', '20260630112041', '20260630180000', '20260630235235', '20260630235335', '20260701003824', '20260702105646', '20260702140928', '20260705120000', '20260705235243', '20260705235326', '20260707120000', '20260709144202', '20260709150000', '20260709210000', '20260710000814', '20260710000909', '20260710001023', '20260710020446', '20260710030950', '20260710031332', '20260710062206', '20260710090757', '20260710173651', '20260710180500', '20260711004046', '20260711005941', '20260712120000', '20260713161357', '20260713171500', '20260715000000', '20260715090000', '20260718013827', '20260718020811', '20260718020912', '20260718054115', '20260718054214', '20260718061302', '20260718090000', '20260718110000', '20260718120000', '20260718120802', '20260718125437', '20260718125513', '20260718130000', '20260718130001', '20260718195944', '20260718205104', '20260718205159', '20260718212720', '20260718225008', '20260718230331', '20260719100000', '20260719101000', '20260719102000', '20260719103000', '20260719104000', '20260719105000', '20260719106000', '20260719107000', '20260719108000', '20260719120000', '20260719122420', '20260719123238', '20260719233818', '20260720014218', '20260720035839', '20260721120000', '20260721120001', '20260721223403', '20260721224347', '20260722100000', '20260722101000', '20260722102000', '20260722103000', '20260722104000', '20260722144523', '20260723120000', '20260725120000', '20260728140000', '20260729100000', '20260729110000', '20260729120000', '20260729130000', '20260730090000', '20260730120000', '20260730120001', '20260731130000', '20260801120000', '20260802120000', '20260802120001', '20260803120000', '20260803130000', '20260803150000', '20260803153000', '20260803160000', '20260803170000', '20260804120000', '20260804130000', '20260805120000', '20260806120000', '20260809120000', '20260810120000', '20260811120000', '20260818120000', '20260819090000', '20260819120000', '20260819130000', '20260819140000', '20260824120000', '20260824130000', '20260824140000', '20260824150000', '20260826120000', '20260831120000', '20260831121000', '20260831130000', '20260831140000', '20260831150000', '20260831160000', '20260904120000', '20260907140000', '20260909120000', '20260909210000', '20260910120000', '20260910134500', '20260910140000', '20260910150000', '20260911090000', '20260912090000', '20260912091000', '20260912092000', '20260913120000', '20260913210000', '20260913213000', '20260921120000', '20260921130000', '20260922170000', '20260924130000', '20260925100000', '20260925101000', '20260925102000', '20260925121000', '20260925130000', '20260926120000', '20260926140000', '20260926160000', '20260927100000', '20260927120000', '20260928120000', '20260929120000', '20260929140000', '20260929150000', '20260929151000', '20260929152000', '20260929153000', '20260929154000', '20260929155000', '20260929156000', '20260929157000', '20260929180000', '20260930100000', '20260930101000', '20260930140000', '20260930190000', '20260930200000', '20261001090000', '20261001100000', '20261001120000', '20261003190000', '20261005120000', '20261006090000', '20261006150000', '20261006170000', '20261006200000', '20261009120000', '20261009120100', '20261009130000');

-- 3) Wstawienie 304 wersji z repo (version, name)
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260518124329', '6f4d86cc-9ac8-43f8-8afc-9a88d09368d8', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260518124401', 'c5ef0688-753f-4963-aa61-3f84a4c217dc', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260519073941', '6a06143b-7333-49b4-9eb8-3b8c38565be5', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260519073952', 'ff133096-4a6f-4666-9ab5-e1729a46eade', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260519075715', 'f001f371-47ec-4f41-a96c-6856a47b7c7b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260519111620', '2739fd55-9351-4c33-8406-b4623ef65244', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260519142312', 'bcfaa862-22b4-4097-b78f-c874a846408f', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260519203350', 'email_infra', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260519203447', 'email_infra', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260519203522', 'email_infra', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260526115114', '4d7be03a-cf8d-48f3-8573-417ba27c2ee8', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260526203320', 'dd259a5d-81af-4e98-b51f-7a557453e591', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260526232558', '37810e28-c31f-4868-b86b-1e528ef91ecf', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260526233833', '5300ead3-a6d0-4d7d-bd66-41cd549624d0', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260527003234', 'bd07557e-95b2-4aa3-a69d-4a887df838c3', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260527161315', '49b550e8-8520-433f-8e09-f941ce8a66cc', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260527203521', '683e9442-7f50-44ae-a950-f9a8be1e0c17', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528112056', 'c1fc2052-bf27-44b0-a38e-d4905582b463', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528115241', '61acc1b2-5e07-4e24-9392-447b41f3516c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528115620', '38e47af7-f7af-4117-812d-791c52be68d5', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528120801', '55a0672c-ecf7-4c10-aa72-e85e747db902', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528122142', '32dfb58a-5666-4419-baa8-c7b8fb5f0969', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528165729', '22a82a20-f65b-418e-9678-01f2a52b1dc9', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528182256', 'b0e22b57-525e-4009-ad71-2ec501e55ecc', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528192627', 'a16f6952-bef2-485c-8895-3f59ca26f4f5', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528205257', '98af1b75-9238-4851-97b8-812b919883b6', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528214949', '6e9cd635-7345-4952-807a-870582c27688', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528225652', '8c86c938-ac9d-466b-b2f1-742ca1969bf3', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260528234220', 'dc856456-f6f3-482e-b605-536a2671b21d', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260601105710', '82649a9e-1660-454c-991d-25965a3ccc82', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260601145135', '18cfee19-c31f-4ee9-af42-07e93d36266c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260601164344', '11f40de0-786e-4a24-b742-be5412e868e9', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260601180517', '7af3eae0-6a6c-4bde-a533-daf4911961c4', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260601182540', 'email_infra', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260601195506', '59687f38-ab30-482d-a678-1860cb8bebf8', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260601202039', '00682ddd-9585-4369-a4b9-37245b86077b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260601214353', '232ffa23-6abd-48ee-91a8-e49f47651640', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602142307', '38c5d757-ecde-4670-a351-52e1d2f6254d', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602142659', '3eaca8f4-ebbf-40e3-bf4b-f46f7e783e84', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602143404', 'c2e5448a-d3c7-410f-b0ea-da1f6056fb7c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602143639', 'c92ce0cd-0291-4ada-a257-ce95e5df8fc0', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602144203', 'a394b1de-69ff-458b-8601-6bfc4cdac42a', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602144602', '56ed2e58-15cf-40f2-a4e2-8274b1afbf82', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602145239', 'c7343729-e2e4-4e5b-a93c-55e4619465d7', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602145555', 'df491a86-4729-4cba-83d6-7e683060d7b1', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602150006', '066d30c9-f178-42b2-895d-f5c0059e35be', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602151332', '296b1da9-3c10-4e0d-810f-3df22a0bc224', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602152221', '5dc08091-aa92-4b48-9299-5aae975cdc39', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602154609', '36751596-4447-4901-93a8-ce29cd2270cb', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602155237', '0ff351fb-a51a-4530-886d-223617d74992', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602160132', '821d170d-375c-4942-9131-2a995f5072ec', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602160245', 'd1e4896a-154c-4862-87a3-9bcf152d401c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602170159', '8db799dd-ed67-45aa-9cbc-90cdb2f533f8', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602171637', '51c8dafd-f8b6-4c20-b003-f586d12ff9a8', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602195652', '1e4f5c03-3996-4ac6-8aec-b061849162bb', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602203232', '0d3ba102-b7fb-4e44-a720-a7c356db956b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260602204417', '19bd76ee-3fc2-486e-a708-d382cf8c20c5', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260604110826', 'eb6eb3ba-c682-4697-a9f6-14b1d41c4114', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260604191654', '1611f3d3-9013-4793-82d7-b532f2d463ed', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260604192735', 'e6089643-5102-48b1-98bd-842fdc381aa6', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608080910', 'bff9291d-4c8a-4f78-bdaa-c393b13f3ccf', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608081720', '47178c19-02ab-452d-a9b0-c9e60917839c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608082656', 'f4028760-32e7-42f2-89bf-c9a66035b6e7', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608095337', '004e72ac-25f3-4ed2-a8b1-86dfccc9af29', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608103556', '802a6295-8cdd-4715-8c9e-2f55b00479e6', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608130744', '98308b77-c5ba-4d19-9c5e-7fec9c3c196a', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608150000', 'update_voicebot_agent', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608152139', 'a2ebe4c9-5f4f-455c-8c19-2f53ee8dcf1b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608165242', '03ae6bc4-7f5c-49ea-a80b-9f7e7d7fd78b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608172813', '8faeccab-39f3-491e-ba02-93d57cd9f536', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608174941', 'ca173ef9-86fa-4c43-986b-18a2b88f4328', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608223322', 'f8051b6e-b868-4c60-ab0b-46b7a746c5a2', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608230655', '15424cfc-f760-43e2-be14-3ee999693dcf', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608230743', 'b81cfe94-14ea-4914-96fe-d3d71998ff70', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260608235511', '2b6e2c25-4f50-4b42-b144-0926356bd9df', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609080012', 'b4adac17-d52f-43ed-a16e-220b72ab00dc', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609082926', '41fefc84-5858-45b7-be02-bc151f526541', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609091620', '9c6ad532-4c87-4e93-9ebb-b86fbffaca6d', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609100040', '87145660-235c-48d4-a075-7c4998dd6492', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609125515', 'b691a52c-1266-49b0-b9c1-b4316de16563', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609131225', '5b607c85-5374-4d3b-935c-4b656b93e499', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609181836', 'f6ce2ed7-8b4f-426e-b34f-f34c259929e3', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609182048', 'beed4943-3a72-4d9e-82fd-bd70f25435b9', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609222247', 'e2b800f0-0eac-45da-9216-2e4d8d66defd', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260609223703', 'bb9902d4-8bc3-4559-a5d6-3bb293c2a0e8', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260610122834', '8898985c-442a-4eb9-a7c9-d8638a5176c9', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260610130347', '8392da6c-5747-432b-b7a0-3a5b650e4342', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260610131007', '4b2114d1-9f4a-4304-aecb-ff1dbed8ab60', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260610153949', 'fdc914e3-8493-49fd-bcf4-b22d0cc80999', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260613024657', 'b01e0f33-9628-45b1-90ed-da5454993fe7', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260615114128', 'ec1f8968-727c-4749-9e12-9de299ef37f4', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260615114233', 'bb602985-9fdb-40d4-99b5-9a4fe980721c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260618135320', '621d2071-a698-4f41-9dbb-c5286d8a3b1c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260618135921', 'b9e74ead-f144-482b-b4b8-12a567353b47', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260618152223', '182ae355-f295-4d4c-8b09-2f0bc7d53751', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260618154755', 'aaeabdfb-c602-4b12-8e66-e3ed3d403e1f', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260619070937', '3b375e71-e1a6-49ef-a9a8-76feb5154ca0', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260619133711', 'ea42e909-4b33-4400-9ff5-464b9dfb8b8a', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260621194033', '9b2133cd-cd72-4f8f-969c-bbd2e6497c67', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260623153029', '87dbc86a-fbf5-4a05-b655-56f0b215f67c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260624141157', 'ade0216d-e5de-422a-92c3-3a77fff7936a', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260624233124', '69aad89e-4278-436a-99d4-d5c5ac3de01d', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260624234251', 'e3000e4e-c237-42a1-b943-c8864d1c6495', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260624234935', 'a612a483-717d-47e7-bc80-53a5afb3af45', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260625204535', '297ac643-1cbc-4841-9c72-48c105ba7311', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260625231919', '3bf78fea-8cf2-4915-98ea-e62ad3f7936d', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260625232527', '19987c81-f7ee-4016-9f81-8f9affd36962', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626002442', '512d3923-0958-44e7-8b5d-bb8dce3f316b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626012023', '410ab4cb-764f-4c48-b95e-aa146078c3d5', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626071514', '0f55a5c3-497d-458e-a243-55b0b24c65ca', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626111610', '338834cf-a572-4f0d-8fea-e9d644b1bdc1', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626130000', 'affiliate_role_ksiegowosc', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626130100', 'affiliate_program', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626130200', 'accounting_ksef', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626130300', 'affiliate_referral_capture', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626133033', 'ac1bd273-d923-44ee-aef8-7575e1554c23', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260626133131', '02c27456-3e00-4a08-8c97-76f04018084a', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629115221', 'e5598f26-b163-4fd6-a637-140aaf0de145', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629115424', '67dc97b8-7467-4b83-9924-a5fea4c7bdd3', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629115507', '3432ded7-1258-423a-a9b8-6099fa1a5a47', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629115544', 'b9232ea3-3d10-4eac-9d4a-a1f2edfe2b81', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629124734', '25c98eaa-983a-4267-a092-0a8ee27023fc', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629141057', 'c5439e75-f0bc-4a8b-8230-2b6f4f99bc20', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629143343', 'fe4ddb3b-cf38-4d7b-b994-86e047e74ff0', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629145430', '236dec4d-fa2f-4b85-b2f2-a2e7950a708d', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629162531', '771d0e54-5661-4d9b-9340-75cf192c9702', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260629174733', 'c103cb28-0051-4fbd-8c7b-593ac5eb1e95', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260630112041', '342e7899-990b-45e4-8246-6d327849472e', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260630180000', 'wind_termination_fields', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260630235235', 'b762186b-0cc6-4baa-8e17-f2c04a3a47bb', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260630235335', 'af969416-68ab-48e4-9dd3-f67698ede4db', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260701003824', '423eaa93-d513-47b2-9637-ce4efdf0fe26', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260702105646', 'a0bfafbe-00db-4868-99bb-ad60a4f94c21', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260702140928', 'efc647ed-8766-4c6c-bd34-6b483b696b39', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260705120000', 'followup_templates_120', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260705235243', '764996da-f427-4e56-a43b-bb60c51c2ed1', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260705235326', '1cd0456b-a846-4ec9-a32a-6a68b3a00b89', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260707120000', 'schedule_automation_crons', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260709144202', '277d0024-e7e2-4f87-bd7c-3dd95d438ef8', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260709150000', 'reminder_sample_flag', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260709210000', 'unify_loan_statuses', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710000814', '629d214b-c788-44b8-bf49-fbc0a086a57e', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710000909', '51d3bb4c-2364-42df-a317-d9a7d4ac1adf', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710001023', '807e5308-3240-44f1-a62f-9a5399d39dfc', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710020446', '6b54bf56-b066-4c8c-bb8b-f4dc1e2338db', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710030950', '1875e254-e278-4c7b-936d-33a9dbfda85c', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710031332', '35e9b663-8340-4016-9064-877175787d7d', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710062206', 'fd5e8706-e1b5-466a-b26a-5781a5fb88b4', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710090757', '8a2c8d0a-e437-483f-a886-0184351fdefa', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710173651', 'ca271d7a-205b-4e68-879b-48ff26c6ef54', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260710180500', 'clean_phone_glued_names', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260711004046', 'ff7c9b65-4e64-46ab-a8e4-5cefc4de77a2', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260711005941', '70dec782-943d-4b0c-8809-893f70feafb3', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260712120000', 'investment_risk_assessments', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260713161357', '48b4f846-b70f-40b9-a1fa-8ca35923ac7e', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260713171500', 'messenger_outbox', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260715000000', 'bind_operator_invite_to_email', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260715090000', 'pliki_klienta_unified_bucket', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718013827', 'c0f054e8-17f3-4943-80f1-c41a45891dad', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718020811', '89e902ff-1d89-418a-89a3-5c044f72a8e0', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718020912', 'b0498aa2-4ba5-4c07-803a-3e053d9ea4df', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718054115', '796e35cb-9f09-4134-9d00-2c734923a5de', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718054214', 'f39d57c4-762d-4f5e-a590-483f268336b1', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718061302', '6be9a133-f8d3-46e2-9814-97fbadaf7b32', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718090000', 'move_stray_legacy_bucket_files', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718110000', 'odzyskaj_dane_zgubione_przy_dedup', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718120000', 'reconcile_storage_helpers', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718120802', '471c7ba6-e670-4e57-bc38-cce652bf97d1', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718125437', '84da969c-48fb-4839-ac30-52d6b879420b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718125513', '0c44151a-a080-40d6-893f-130490b675e1', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718130000', 'cleanup_reconcile_helpers', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718130001', 'rcn_transactions', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718195944', '81ba2c7e-f402-49fa-a821-250e8794002e', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718205104', '837a0090-d23d-4a62-99fa-99f8e0739286', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718205159', '4acdf3bc-4a6c-4c6c-b3f6-d7359c239c44', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718212720', '2e9b06ec-d93d-45b2-b5ba-63a78102aefe', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718225008', 'a35b9b25-9af8-4eb8-bef3-017e45ae4aa9', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260718230331', '075e7d4a-1f19-4485-9059-c24792322594', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719100000', 'add_role_posrednik', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719101000', 'access_products_catalog', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719102000', 'access_payments_entitlements', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719103000', 'access_functions', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719104000', 'broker_offers_ownership', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719105000', 'partner_role_posrednik', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719106000', 'investor_paywall_rls', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719107000', 'sales_invoices_buyer_user', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719108000', 'access_expiry_notifications', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719120000', 'investor_free_tier', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719122420', '6b33b2d4-5950-4667-9a15-7ea3b80f93a8', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719123238', 'a785cdf2-92a7-4814-9292-24dd85a65899', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260719233818', 'e882784d-7bc0-412e-b31b-6510ffdf0430', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260720014218', '521aaede-7c75-4d30-a4ae-fba9012998c0', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260720035839', '56a3179a-105a-45c9-90ed-d7e0f636d106', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260721120000', 'demote_incomplete_applications', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260721120001', 'didit_kyc', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260721223403', '5dc86f97-b591-49b6-bd11-cb16dd80c5c6', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260721224347', '39678d43-ff0b-4d74-8cdc-30522c0b8eb4', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260722100000', 'project_module_core', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260722101000', 'project_pool', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260722102000', 'project_assignments', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260722103000', 'project_proposals', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260722104000', 'project_module_cron', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260722144523', '38e486fe-188d-4670-a556-b38d4f1f601b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260723120000', 'kw_land_register_analysis', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260725120000', 'location_scoring', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260728140000', 'location_scoring_auto', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260729100000', 'location_scoring_settlement', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260729110000', 'team_activity_feed', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260729120000', 'location_scoring_trigger_guard', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260729130000', 'coowner_registry_checks', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260730090000', 'bot_loop_guard', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260730120000', 'missing_info_follow_up', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260730120001', 'offer_card_distribution', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260731130000', 'dedupe_institutional_investors', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260801120000', 'youtube_shorts', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260802120000', 'module_access_full_investor', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260802120001', 'remove_investor_free_tier', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260803120000', 'windykacja_simplified', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260803130000', 'studio_publikacji', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260803150000', 'seo_location_pages', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260803153000', 'seo_location_report', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260803160000', 'pr_module', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260803170000', 'video_pipeline', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260804120000', 'institutional_investor_bot', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260804130000', 'investor_assistant_split', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260805120000', 'studio_video_batch', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260806120000', 'studio_captions_and_meta_backoff', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260809120000', 'ai_admin_memory', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260810120000', 'ai_admin_comms_access', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260811120000', 'ai_admin_model_refresh', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260818120000', 'studio_burned_in_captions', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260819090000', 'studio_dynamic_scenes', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260819120000', 'investor_mail_no_lead', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260819130000', 'wyczysc_leady_inwestorow', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260819140000', 'operator_push_notifications', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260824120000', 'location_scoring_seed_real', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260824130000', 'location_scoring_ms_teryt', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260824140000', 'location_scoring_unstick', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260824150000', 'location_scoring_prefix_aliases', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260826120000', 'ai_admin_full_access', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260831120000', 'loan_status_history', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260831121000', 'loan_status_email_cron', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260831130000', 'auto_distribution', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260831140000', 'analysis_pipeline', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260831150000', 'institution_mail_agent', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260831160000', 'elevenlabs_process_agents', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260904120000', 'investor_legal_pack', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260907140000', 'investor_order_cycle', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260909120000', 'institution_qa_threads_ops', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260909210000', 'institution_mail_outbound_pause', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260910120000', 'short_links', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260910134500', 'meta_leads_pull_co_5_minut', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260910140000', 'meta_lead_forms_przekazanie_do_klienta', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260910150000', 'meta_leads_pull_co_15_minut', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260911090000', 'leady_klienta_bez_sladu_w_finansiu', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260912090000', 'follow_up_plan_tick_cron', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260912091000', 'pliki_klienta_wlasne_dokumenty', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260912092000', 'leadcomm_kanal_data_index', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260913120000', 'odciski_promptow_agentow', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260913210000', 'sms_kill_switch', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260913213000', 'sms_pause_scope_conversational', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260921120000', 'cennik_i_pipeline_inwestora', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260921130000', 'umowa_ramowa_v6_oplaty_inwestora', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260922170000', 'cron_timeouts_purge_history', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260924130000', 'kw_normalizacja_i_legacy_umowy', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260925100000', 'inwestor_zakres_wnioskow', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260925101000', 'inwestor_analiza_kw_zewnetrzna', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260925102000', 'inwestor_analiza_kw_ocena_ryzyka', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260925121000', 'access_payments_unlock_inflight', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260925130000', 'dogonienie_cennika_i_indeksy_timeoutow', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260926120000', 'tiktok_content_posting', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260926140000', 'tiktok_ustawienia_publikacji_tworcy', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260926160000', 'x_publikacja', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260927100000', 'wind_oplaty_umowne', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260927120000', 'studio_bank_broll_i_domyslne_awatary', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260928120000', 'studio_napisy_wlasne', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929120000', 'video_renditions', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929140000', 'studio_material_audience', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929150000', 'etap0_bezpieczenstwo_teaserow', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929151000', 'etap1_inwestor_bez_oplat', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929152000', 'etap2_ltv_60', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929153000', 'etap3_zlecenia_limity', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929154000', 'etap4_statusy_wniosku', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929155000', 'etap5_pakiet_inwestor_v7', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929156000', 'etap5_zgody_v2', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929157000', 'etap5_akceptacje_zgod_i_boty', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260929180000', 'pliki_klienta_naprawa_przeniesionych', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260930100000', 'polityka_v2_cookies', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260930101000', 'cookie_consent_log', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260930140000', 'abonament_inwestora', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260930190000', 'prowizja_od_pozyczkobiorcy', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20260930200000', 'checkout_inwestora_bez_konta', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261001090000', 'tubapay_platnosci', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261001100000', 'zlecenie_tylko_kwota_max', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261001120000', 'kody_rabatowe', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261003190000', 'studio_lektor_model_napisy_z_elevenlabs', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261005120000', 'podpis_dokumentowy', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261006090000', 'podpis_klient_pozyczkowy', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261006150000', 'lead_magnety', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261006170000', 'lead_magnety_email_w_wiadomosci', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261006200000', 'wind_harmonogram_pozyczkodawca', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261009120000', 'pep_screening', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261009120100', 'pep_position_catalog_seed', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('20261009130000', 'wzor_procedura_aml_cft_b2b', null)
  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);

-- 4) Kontrola: oczekiwane n = liczba wersji w repo, brak_w_repo = 0
select count(*) as n, min(version), max(version),
       count(*) filter (where version not in ('20260518124329', '20260518124401', '20260519073941', '20260519073952', '20260519075715', '20260519111620', '20260519142312', '20260519203350', '20260519203447', '20260519203522', '20260526115114', '20260526203320', '20260526232558', '20260526233833', '20260527003234', '20260527161315', '20260527203521', '20260528112056', '20260528115241', '20260528115620', '20260528120801', '20260528122142', '20260528165729', '20260528182256', '20260528192627', '20260528205257', '20260528214949', '20260528225652', '20260528234220', '20260601105710', '20260601145135', '20260601164344', '20260601180517', '20260601182540', '20260601195506', '20260601202039', '20260601214353', '20260602142307', '20260602142659', '20260602143404', '20260602143639', '20260602144203', '20260602144602', '20260602145239', '20260602145555', '20260602150006', '20260602151332', '20260602152221', '20260602154609', '20260602155237', '20260602160132', '20260602160245', '20260602170159', '20260602171637', '20260602195652', '20260602203232', '20260602204417', '20260604110826', '20260604191654', '20260604192735', '20260608080910', '20260608081720', '20260608082656', '20260608095337', '20260608103556', '20260608130744', '20260608150000', '20260608152139', '20260608165242', '20260608172813', '20260608174941', '20260608223322', '20260608230655', '20260608230743', '20260608235511', '20260609080012', '20260609082926', '20260609091620', '20260609100040', '20260609125515', '20260609131225', '20260609181836', '20260609182048', '20260609222247', '20260609223703', '20260610122834', '20260610130347', '20260610131007', '20260610153949', '20260613024657', '20260615114128', '20260615114233', '20260618135320', '20260618135921', '20260618152223', '20260618154755', '20260619070937', '20260619133711', '20260621194033', '20260623153029', '20260624141157', '20260624233124', '20260624234251', '20260624234935', '20260625204535', '20260625231919', '20260625232527', '20260626002442', '20260626012023', '20260626071514', '20260626111610', '20260626130000', '20260626130100', '20260626130200', '20260626130300', '20260626133033', '20260626133131', '20260629115221', '20260629115424', '20260629115507', '20260629115544', '20260629124734', '20260629141057', '20260629143343', '20260629145430', '20260629162531', '20260629174733', '20260630112041', '20260630180000', '20260630235235', '20260630235335', '20260701003824', '20260702105646', '20260702140928', '20260705120000', '20260705235243', '20260705235326', '20260707120000', '20260709144202', '20260709150000', '20260709210000', '20260710000814', '20260710000909', '20260710001023', '20260710020446', '20260710030950', '20260710031332', '20260710062206', '20260710090757', '20260710173651', '20260710180500', '20260711004046', '20260711005941', '20260712120000', '20260713161357', '20260713171500', '20260715000000', '20260715090000', '20260718013827', '20260718020811', '20260718020912', '20260718054115', '20260718054214', '20260718061302', '20260718090000', '20260718110000', '20260718120000', '20260718120802', '20260718125437', '20260718125513', '20260718130000', '20260718130001', '20260718195944', '20260718205104', '20260718205159', '20260718212720', '20260718225008', '20260718230331', '20260719100000', '20260719101000', '20260719102000', '20260719103000', '20260719104000', '20260719105000', '20260719106000', '20260719107000', '20260719108000', '20260719120000', '20260719122420', '20260719123238', '20260719233818', '20260720014218', '20260720035839', '20260721120000', '20260721120001', '20260721223403', '20260721224347', '20260722100000', '20260722101000', '20260722102000', '20260722103000', '20260722104000', '20260722144523', '20260723120000', '20260725120000', '20260728140000', '20260729100000', '20260729110000', '20260729120000', '20260729130000', '20260730090000', '20260730120000', '20260730120001', '20260731130000', '20260801120000', '20260802120000', '20260802120001', '20260803120000', '20260803130000', '20260803150000', '20260803153000', '20260803160000', '20260803170000', '20260804120000', '20260804130000', '20260805120000', '20260806120000', '20260809120000', '20260810120000', '20260811120000', '20260818120000', '20260819090000', '20260819120000', '20260819130000', '20260819140000', '20260824120000', '20260824130000', '20260824140000', '20260824150000', '20260826120000', '20260831120000', '20260831121000', '20260831130000', '20260831140000', '20260831150000', '20260831160000', '20260904120000', '20260907140000', '20260909120000', '20260909210000', '20260910120000', '20260910134500', '20260910140000', '20260910150000', '20260911090000', '20260912090000', '20260912091000', '20260912092000', '20260913120000', '20260913210000', '20260913213000', '20260921120000', '20260921130000', '20260922170000', '20260924130000', '20260925100000', '20260925101000', '20260925102000', '20260925121000', '20260925130000', '20260926120000', '20260926140000', '20260926160000', '20260927100000', '20260927120000', '20260928120000', '20260929120000', '20260929140000', '20260929150000', '20260929151000', '20260929152000', '20260929153000', '20260929154000', '20260929155000', '20260929156000', '20260929157000', '20260929180000', '20260930100000', '20260930101000', '20260930140000', '20260930190000', '20260930200000', '20261001090000', '20261001100000', '20261001120000', '20261003190000', '20261005120000', '20261006090000', '20261006150000', '20261006170000', '20261006200000', '20261009120000', '20261009120100', '20261009130000')) as brak_w_repo
  from supabase_migrations.schema_migrations;
