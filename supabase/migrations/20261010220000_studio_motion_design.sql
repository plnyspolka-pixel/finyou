-- Elementy dynamiczne rolki (silnik Remotion): projekt z katalogu
-- src/lib/motion-catalog.ts — od projektanta AI (motion-designer.server.ts)
-- albo wgrany narzędziem MCP `set_studio_motion`. Null = zaprojektuj przy
-- wykończeniu. Zapisany projekt sprawia, że ponowne wypalenie napisów
-- daje te same elementy.
alter table public.studio_video_jobs add column if not exists motion_design jsonb;
comment on column public.studio_video_jobs.motion_design is 'Elementy dynamiczne rolki (silnik Remotion): projekt z katalogu motion-catalog.ts — od projektanta AI albo wgrany narzędziem set_studio_motion. Null = zaprojektuj przy wykończeniu.';
