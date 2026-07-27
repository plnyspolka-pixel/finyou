import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from "@react-email/components";

interface RecoveryEmailProps {
  siteName: string;
  confirmationUrl: string;
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Zresetuj hasło i wróć do swojego wniosku w {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Link href="https://financeyou.pl">
          <Img
            src="https://financeyou.pl/__l5e/assets-v1/73e2df85-6890-4ae6-a18a-debbc0970e07/favicon-mark.png"
            width="64"
            height="64"
            alt="FinanceYou"
            style={logo}
          />
        </Link>
        <Heading style={h1}>Spokojnie — to się zdarza najlepszym</Heading>
        <Text style={text}>
          Hasła to taka rzecz, którą zapomina się zwykle w najgorszym momencie: tuż przed rozmową z
          doradcą, w dniu finalizacji albo gdy klient czeka na decyzję. Dlatego nie pytamy
          „dlaczego" — po prostu zostawiamy Ci jeden klik, żeby wrócić do swojej sprawy w{" "}
          <Link href="https://financeyou.pl" style={link}>
            FinanceYou
          </Link>
          .
        </Text>
        <Text style={text}>
          Jeśli to Ty poprosiłeś o reset hasła, użyj przycisku poniżej. Link działa krótko — celowo,
          żeby nikt inny nie mógł go wykorzystać.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Ustaw nowe hasło
        </Button>
        <Text style={text}>
          Po ustawieniu nowego hasła wrócisz prosto do swojego panelu — z wnioskiem dokładnie w
          miejscu, w którym go zostawiłeś.
        </Text>
        <Text style={text}>
          A jeśli przy okazji chcesz sprawdzić, co u nas nowego — zajrzyj na{" "}
          <Link href="https://financeyou.pl" style={link}>
            financeyou.pl
          </Link>{" "}
          lub poczytaj{" "}
          <Link href="https://financeyou.pl/blog" style={link}>
            nasz blog
          </Link>
          , gdzie tłumaczymy pożyczki pod nieruchomość po ludzku.
        </Text>
        <Text style={footer}>
          Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość — Twoje konto jest bezpieczne.
        </Text>
        <Link
          href="https://financeyou.pl"
          style={{
            display: "block",
            textAlign: "center",
            textDecoration: "none",
            margin: "24px 0 8px",
          }}
        >
          <Img
            src="https://financeyou.pl/__l5e/assets-v1/78c589be-8669-4bdf-a471-ff97875e8d7a/financeyou-wordmark.png"
            width="180"
            alt="financeyou.pl"
            style={{ display: "block", margin: "0 auto", maxWidth: "60%", height: "auto" }}
          />
        </Link>
        <Text
          style={{ fontSize: "13px", color: "#55575d", textAlign: "center", margin: "0 0 8px" }}
        >
          Masz pytanie? <strong>Po prostu odpisz na tego maila</strong>, czytamy każdą wiadomość i
          odpowiadamy.
        </Text>
        <Text style={unsubStyle}>
          <Link href="https://financeyou.pl/email/unsubscribe" style={unsubLink}>
            Nie chcę otrzymywać tych wiadomości
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

export default RecoveryEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "20px 25px", maxWidth: "560px" };
const logo = { display: "block" as const, margin: "0 auto 16px" };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#000000", margin: "0 0 20px" };
const text = { fontSize: "14px", color: "#55575d", lineHeight: "1.6", margin: "0 0 18px" };
const link = { color: "#000000", textDecoration: "underline" };
const button = {
  backgroundColor: "#000000",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "8px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
  margin: "6px 0 22px",
};
const footer = { fontSize: "12px", color: "#999999", margin: "24px 0 0" };
const unsubStyle = {
  fontSize: "11px",
  color: "#bbbbbb",
  marginTop: "24px",
  textAlign: "center" as const,
};
const unsubLink = { color: "#bbbbbb", textDecoration: "underline" };
