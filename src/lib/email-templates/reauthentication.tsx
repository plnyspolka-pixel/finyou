import * as React from "react";

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from "@react-email/components";

interface ReauthenticationEmailProps {
  token: string;
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Twój kod weryfikacyjny do FinanceYou</Preview>
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
        <Heading style={h1}>Jeszcze jeden krok dla bezpieczeństwa</Heading>
        <Text style={text}>
          Robisz w{" "}
          <Link href="https://financeyou.pl" style={link}>
            FinanceYou
          </Link>{" "}
          coś ważnego — zmieniasz ustawienia, zatwierdzasz operację albo wracasz do wrażliwej części
          panelu. Dlatego prosimy o jedno dodatkowe potwierdzenie: krótki kod, który mamy tylko my i
          Ty.
        </Text>
        <Text style={text}>Wpisz poniższy kod w okienku weryfikacji:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={text}>
          Kod jest ważny tylko kilka minut. Nie przekazuj go nikomu — żaden konsultant FinanceYou
          ani z banku nigdy nie poprosi Cię o ten kod telefonicznie.
        </Text>
        <Text style={text}>
          Więcej o tym, jak chronimy Twoje dane i jak działa proces pożyczki pod nieruchomość,
          znajdziesz na{" "}
          <Link href="https://financeyou.pl" style={link}>
            financeyou.pl
          </Link>{" "}
          oraz na{" "}
          <Link href="https://financeyou.pl/blog" style={link}>
            naszym blogu
          </Link>
          .
        </Text>
        <Text style={footer}>
          Jeśli nie prosiłeś o ten kod, zignoruj tę wiadomość i — dla pewności — zmień hasło do
          swojego konta.
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

export default ReauthenticationEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "20px 25px", maxWidth: "560px" };
const logo = { display: "block" as const, margin: "0 auto 16px" };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#000000", margin: "0 0 20px" };
const text = { fontSize: "14px", color: "#55575d", lineHeight: "1.6", margin: "0 0 18px" };
const link = { color: "#000000", textDecoration: "underline" };
const codeStyle = {
  fontSize: "28px",
  fontWeight: "bold" as const,
  letterSpacing: "6px",
  color: "#000000",
  textAlign: "center" as const,
  margin: "12px 0 22px",
};
const footer = { fontSize: "12px", color: "#999999", margin: "24px 0 0" };
const unsubStyle = {
  fontSize: "11px",
  color: "#bbbbbb",
  marginTop: "24px",
  textAlign: "center" as const,
};
const unsubLink = { color: "#bbbbbb", textDecoration: "underline" };
