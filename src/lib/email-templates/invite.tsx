import * as React from 'react'

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
} from '@react-email/components'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Zaproszenie do {siteName} — kapitał ukryty w nieruchomości czeka</Preview>
    <Body style={main}>
      <Container style={container}>
        <Link href="https://financeyou.pl">
          <Img src="https://financeyou.pl/__l5e/assets-v1/58b0a934-fc94-423a-95ed-aca9497ecd99/favicon.png" width="64" height="64" alt="FinanceYou" style={logo} />
        </Link>
        <Heading style={h1}>Witaj w FinanceYou</Heading>
        <Text style={text}>
          Ktoś, kto Cię zna, uznał, że to miejsce dla Ciebie — i zaprosił Cię do <Link href="https://financeyou.pl" style={link}>FinanceYou</Link>.
          Pomagamy ludziom uwolnić kapitał, który drzemie w ich nieruchomościach: na remont, rozwój firmy, spłatę zobowiązań albo kolejną inwestycję, na którą bank każe czekać tygodniami.
        </Text>
        <Text style={text}>
          Twoje konto czeka — żeby je aktywować, kliknij przycisk poniżej. Zajmuje to mniej czasu niż zaparzenie kawy.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Przyjmij zaproszenie
        </Button>
        <Text style={text}>
          Po zalogowaniu poprowadzimy Cię krok po kroku przez wniosek, dokumenty i decyzję. Bez papierologii, bez kolejek, bez ukrytych kosztów.
        </Text>
        <Text style={text}>
          Zanim klikniesz — możesz zerknąć, jak działamy: zajrzyj na{' '}
          <Link href={siteUrl} style={link}>{siteName}</Link>,{' '}
          <Link href="https://financeyou.pl" style={link}>financeyou.pl</Link> albo poczytaj historie klientów na{' '}
          <Link href="https://financeyou.pl/blog" style={link}>naszym blogu</Link>.
        </Text>
        <Text style={footer}>
          Jeśli nie wiesz, kto Cię zaprosił, lub uważasz, że to pomyłka — po prostu nic nie rób.
        </Text>
        <Text style={unsubStyle}>
          <Link href="https://financeyou.pl/email/unsubscribe" style={unsubLink}>Nie chcę otrzymywać tych wiadomości</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px' }
const logo = { display: 'block' as const, margin: '0 auto 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 18px' }
const link = { color: '#000000', textDecoration: 'underline' }
const button = { backgroundColor: '#000000', color: '#ffffff', fontSize: '14px', borderRadius: '8px', padding: '12px 20px', textDecoration: 'none', display: 'inline-block', margin: '6px 0 22px' }
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0' }
const unsubStyle = { fontSize: '11px', color: '#bbbbbb', marginTop: '24px', textAlign: 'center' as const }
const unsubLink = { color: '#bbbbbb', textDecoration: 'underline' }
