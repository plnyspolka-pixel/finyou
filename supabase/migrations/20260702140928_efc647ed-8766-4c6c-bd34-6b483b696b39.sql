INSERT INTO public.user_roles (user_id, role) VALUES 
('199c24d6-0174-495c-b2fc-bf97e36df27b','administrator'),
('199c24d6-0174-495c-b2fc-bf97e36df27b','operator'),
('199c24d6-0174-495c-b2fc-bf97e36df27b','inwestor')
ON CONFLICT (user_id, role) DO NOTHING;