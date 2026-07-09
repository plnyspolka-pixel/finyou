## Cel
Przygotowa\u0107 gotowe do wklejenia teksty w formularzu **Meta App Review \u2192 Testing instructions for Web** dla uprawnie\u0144 `pages_messaging`, `pages_manage_metadata`, `instagram_manage_messages`. Bez zmian w kodzie \u2014 sam content do skopiowania.

## Co dostarcz\u0119 w odpowiedzi (po zatwierdzeniu planu)

Pi\u0119\u0107 blok\u00f3w tekstu, jeden na jedno pole formularza, po angielsku (Meta wymaga EN):

### 1. \u201cWhere can we find the app?\u201d
Jeden URL:
```
https://financeyou.pl/admin/facebook-connect
```

### 2. \u201cProvide instructions for accessing the app\u2026\u201d
Kr\u00f3tka instrukcja krok po kroku:
- otw\u00f3rz URL powy\u017cej,
- zaloguj si\u0119 podanym kontem admina (email + has\u0142o \u2014 pola do uzupe\u0142nienia przez Ciebie),
- panel `/admin/facebook-connect` uruchamia Facebook Login z `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`,
- po po\u0142\u0105czeniu strony **Filip Bielak Consulting** (ID 661893307005604) reviewer widzi subskrypcj\u0119 webhooka Messengera,
- reviewer wysy\u0142a wiadomo\u015b\u0107 na fanpage \u2192 bot odpowiada automatycznie,
- konwersacja pojawia si\u0119 w `/admin/messenger` (split-screen inbox),
- reviewer wysy\u0142a r\u0119czn\u0105 odpowied\u017a z inbox\u2019a \u2192 wiadomo\u015b\u0107 dochodzi do Messengera jako wys\u0142ana przez Stron\u0119,
- to samo dzia\u0142a dla Instagram DM (`instagram_manage_messages`).

Blok b\u0119dzie zawiera\u0142 miejsce na `Email: __` i `Password: __`.

### 3. \u201cIf payment or membership is required\u2026\u201d
```
No payment or membership is required to test this integration. Full access is provided by the admin credentials above.
```

### 4. \u201cIf payment is required to download this app\u2026\u201d
```
Not applicable. This is a web application, no download or in-app purchase is required.
```

### 5. \u201cIf access to this app\u2026 is limited to users within a specific geographic location\u2026\u201d
```
Not applicable. The application is accessible worldwide; no geo-blocking or geo-fencing is in place for the reviewer flow.
```

## Czego potrzebuj\u0119 od Ciebie po planie
Login i has\u0142o konta admina do wpisania w polu 2 (mog\u0119 te\u017c pom\u00f3c za\u0142o\u017cy\u0107 dedykowane konto reviewer\u2019a przez `supabase--insert` z rol\u0105 `administrator` \u2014 daj zna\u0107, je\u015bli ma to by\u0107 cz\u0119\u015bci\u0105 zadania).
