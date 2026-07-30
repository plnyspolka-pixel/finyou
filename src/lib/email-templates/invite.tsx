import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Img,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Zaproszenie do {siteName} — kapitał ukryty w nieruchomości czeka</Preview>
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
        <Heading style={h1}>Witaj w FinanceYou</Heading>
        <Text style={text}>
          Ktoś, kto Cię zna, uznał, że to miejsce dla Ciebie — i zaprosił Cię do{" "}
          <Link href="https://financeyou.pl" style={link}>
            FinanceYou
          </Link>
          . Pomagamy ludziom uwolnić kapitał, który drzemie w ich nieruchomościach: na remont,
          rozwój firmy, spłatę zobowiązań albo kolejną inwestycję, na którą bank każe czekać
          tygodniami.
        </Text>
        <Text style={text}>
          Twoje konto czeka — żeby je aktywować, kliknij przycisk poniżej. Zajmuje to mniej czasu
          niż zaparzenie kawy.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Przyjmij zaproszenie
        </Button>
        <Text style={text}>
          Po zalogowaniu poprowadzimy Cię krok po kroku przez wniosek, dokumenty i decyzję. Bez
          papierologii, bez kolejek, bez ukrytych kosztów.
        </Text>
        <Text style={text}>
          Zanim klikniesz — możesz zerknąć, jak działamy: zajrzyj na{" "}
          <Link href={siteUrl} style={link}>
            {siteName}
          </Link>
          ,{" "}
          <Link href="https://financeyou.pl" style={link}>
            financeyou.pl
          </Link>{" "}
          albo poczytaj historie klientów na{" "}
          <Link href="https://financeyou.pl/blog" style={link}>
            naszym blogu
          </Link>
          .
        </Text>
        <Text style={footer}>
          Jeśli nie wiesz, kto Cię zaprosił, lub uważasz, że to pomyłka — po prostu nic nie rób.
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

export default InviteEmail;

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
