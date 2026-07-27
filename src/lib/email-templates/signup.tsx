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

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Potwierdź adres e-mail i zacznij korzystać z {siteName}</Preview>
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
        <Heading style={h1}>Cześć — i dziękujemy, że jesteś</Heading>
        <Text style={text}>
          Większość ludzi, którzy trafiają do{" "}
          <Link href="https://financeyou.pl" style={link}>
            FinanceYou
          </Link>
          , ma jedną wspólną rzecz: nieruchomość, która śpi, i pomysł, który nie może czekać.
          Remont, spłata długów, zastrzyk kapitału do firmy, zaliczka na kolejną inwestycję — życie
          nie zawsze rozkłada raty równo, a banki nie zawsze mówią „tak" na czas.
        </Text>
        <Text style={text}>
          Założyliśmy FinanceYou właśnie dlatego: żeby kapitał ukryty w czterech ścianach można było
          uwolnić szybko, uczciwie i bez tygodni tłumaczeń. Twoje konto na adres{" "}
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>{" "}
          jest już prawie gotowe — brakuje tylko jednego kliknięcia, żebyśmy wiedzieli, że to
          naprawdę Ty.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Potwierdź e-mail i wejdź do panelu
        </Button>
        <Text style={text}>
          Po potwierdzeniu zobaczysz, jak w praktyce wygląda pożyczka pod zastaw nieruchomości — bez
          ukrytych haczyków, z jasną kalkulacją i decyzją w 24 godziny.
        </Text>
        <Text style={text}>
          A jeśli chcesz najpierw się rozejrzeć — zajrzyj na{" "}
          <Link href="https://financeyou.pl" style={link}>
            financeyou.pl
          </Link>{" "}
          albo poczytaj historie naszych klientów na{" "}
          <Link href="https://financeyou.pl/blog" style={link}>
            blogu FinanceYou
          </Link>
          .
        </Text>
        <Text style={footer}>
          Jeśli to nie Ty zakładałeś konto — po prostu zignoruj tę wiadomość. Nic się nie wydarzy.
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

export default SignupEmail;

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
