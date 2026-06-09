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

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Potwierdź zmianę adresu e-mail w {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Link href="https://financeyou.pl">
          <Img src="https://financeyou.pl/__l5e/assets-v1/58b0a934-fc94-423a-95ed-aca9497ecd99/favicon.png" width="64" height="64" alt="FinanceYou" style={logo} />
        </Link>
        <Heading style={h1}>Nowy adres, ta sama historia</Heading>
        <Text style={text}>
          Zmiana skrzynki to często znak, że coś się w życiu przesuwa — nowa praca, nowy etap firmy, nowy porządek w głowie.
          Cieszymy się, że chcesz zabrać <Link href="https://financeyou.pl" style={link}>FinanceYou</Link> ze sobą do nowej skrzynki.
        </Text>
        <Text style={text}>
          Dla bezpieczeństwa potrzebujemy jednego potwierdzenia, że to naprawdę Ty.
          Wcześniej logowałeś się jako{' '}
          <Link href={`mailto:${oldEmail}`} style={link}>{oldEmail}</Link>{' '}
          — od teraz Twoim adresem ma być{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Potwierdź nowy adres e-mail
        </Button>
        <Text style={text}>
          Po potwierdzeniu wszystkie wiadomości — od statusu wniosku po przypomnienia o dokumentach — zaczną przychodzić na nowy adres. Stary przestanie działać do logowania.
        </Text>
        <Text style={text}>
          Wszystko o nas znajdziesz na{' '}
          <Link href="https://financeyou.pl" style={link}>financeyou.pl</Link>, a najnowsze wpisy i poradniki na{' '}
          <Link href="https://financeyou.pl/blog" style={link}>blogu FinanceYou</Link>.
        </Text>
        <Text style={footer}>
          Jeśli to nie Ty prosiłeś o zmianę adresu, zignoruj tę wiadomość — zmiana nie zostanie wykonana.
        </Text>
        <Text style={unsubStyle}>
          <Link href="https://financeyou.pl/email/unsubscribe" style={unsubLink}>Nie chcę otrzymywać tych wiadomości</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
