-- Wzór: Procedura wewnętrzna AML/CFT dla firmy pożyczkowej B2B.
-- Plik .docx jest dołączony do kodu (src/lib/document-templates) — generator
-- wgrywa go do Storage pod template_file_path przy pierwszym użyciu.
INSERT INTO public.document_templates
  (slug, name, description, category, use_case, output_format, template_file_path, sort_order)
VALUES (
  'procedura-aml-cft-b2b',
  'Procedura wewnętrzna AML/CFT — firma pożyczkowa B2B',
  'Wzór procedury AML/CFT dla instytucji obowiązanej udzielającej pożyczek przedsiębiorcom (w tym hipotecznych). Przed przyjęciem uchwałą Zarządu zestawić z oceną ryzyka i zweryfikować z prawnikiem AML.',
  'procedura',
  'kreator_umow',
  'docx',
  'templates/Procedura_AML_CFT_wzor_B2B.docx',
  330
)
ON CONFLICT (slug) DO NOTHING;
