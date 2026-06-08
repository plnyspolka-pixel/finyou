ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'oczekuje_podpisania_umowy';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'umowa_podpisana';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'oczekuje_ustanowienia_zabezpieczen';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'zabezpieczenia_ustanowione';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'dokumenty_dostarczone_do_inwestora';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'oczekuje_wyplaty';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'wyplacony';
ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'wniosek_odrzucony';