Plan naprawy:

1. Ujednolicić sekret webhooka
   - W kodzie endpoint oczekuje `ELEVENLABS_WEBHOOK_SECRET`.
   - W ElevenLabs masz wybrany sekret `financeyou_webhook_secret`.
   - Dodam obsługę obu nazw po stronie endpointu, żeby obecna konfiguracja ElevenLabs działała bez przepinania panelu.

2. Poprawić odpowiedź endpointu dla ElevenLabs
   - Teraz ElevenLabs pokazuje własny błąd `422 ValueError on content response`, gdy dostaje odpowiedź, której nie potrafi poprawnie zinterpretować.
   - Zmienimy odpowiedzi błędów na proste, przewidywalne JSON-y z krótkim komunikatem, tak żeby test narzędzia pokazywał faktyczny błąd z endpointu.

3. Dodać bezpieczne logowanie diagnostyczne
   - Bez wypisywania sekretów.
   - Log będzie pokazywał tylko, czy sekret był obecny, czy nagłówek przyszedł i jaki status zwróciła wysyłka SMS.

4. Przetestować endpoint
   - Najpierw test z błędnym sekretem powinien zwrócić `401`, czyli endpoint żyje.
   - Potem po publikacji/testowaniu w ElevenLabs powinien zniknąć obecny problem 404/422 i jeśli Twilio ma poprawną konfigurację, SMS powinien przejść.

Ważne: produkcyjne logi nadal pokazują `404` dla `financeyou.pl/api/public/elevenlabs-send-sms`, co znaczy, że najnowszy kod prawdopodobnie nie jest jeszcze opublikowany na domenie produkcyjnej. Po wdrożeniu zmian trzeba kliknąć Publish/Update.