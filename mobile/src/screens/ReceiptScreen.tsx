import React from 'react';
import { Text } from 'react-native';
import { LOGO_DATA_URI } from '../assets/logo';
import { dateLabel, monthsLabel } from '../core/months';
import { RECEIPT_PAGE, receiptHtml } from '../core/templates/receiptHtml';
import { sharePdf } from '../platform/files';
import { attempt, useApp, useLoad } from '../ui/app';
import { Badge, Btn, C, Card, KV, Muted, PromptModal, Row, s, Screen } from '../ui/kit';

export function ReceiptScreen({ paymentId }: { paymentId: string }) {
  const { repo, device, changed } = useApp();
  const { data: p } = useLoad(() => repo.getPayment(paymentId), [paymentId]);
  const [voiding, setVoiding] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);

  if (!p) return <Screen title="Receipt">{null}</Screen>;

  const share = async () => {
    setSharing(true);
    await attempt(
      () =>
        sharePdf(
          receiptHtml({ claim: p.claim, signature: p.signature, collectedBy: p.collectedBy, mobileRef: p.mobileRef, voided: p.voided }, LOGO_DATA_URI, device.verifyBaseUrl),
          `Receipt ${p.receiptNo} ${p.memberName}.pdf`,
          RECEIPT_PAGE,
          'Send receipt (choose WhatsApp)',
        ),
      'Could not share receipt',
    );
    setSharing(false);
  };

  return (
    <Screen title={p.receiptNo}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 32, fontWeight: '800', color: p.voided ? C.muted : C.navy, textDecorationLine: p.voided ? 'line-through' : 'none' }}>${p.amountUsd}</Text>
          {p.voided ? <Badge text="VOID" tone="red" /> : p.imported ? <Badge text="from paper book" tone="grey" /> : <Badge text="signed" tone="green" />}
        </Row>
        <KV k="Received from" v={`${p.memberName} (${p.memberNo})`} />
        <KV k="For" v={monthsLabel(p.months)} />
        <KV k="Date" v={dateLabel(p.paidOn)} />
        <KV k="Method" v={p.method === 'cash' ? 'Cash' : `Mobile money · ${p.mobileRef ?? ''}`} />
        <KV k="Received by" v={p.collectedBy} />
        {p.keyId ? <KV k="Signing key" v={p.keyId} /> : null}
      </Card>
      {p.voided ? (
        <Card style={{ borderColor: C.red }}>
          <Text style={[s.h, { color: C.red }]}>Voided</Text>
          <Muted>
            {p.voided.reason} — by {p.voided.by}, {new Date(p.voided.at).toLocaleString()}
          </Muted>
        </Card>
      ) : null}

      <Btn label="Send PDF receipt (WhatsApp)" onPress={share} busy={sharing} style={{ marginBottom: 10 }} />
      <Muted style={{ marginBottom: 16 }}>Opens Android’s share menu: choose WhatsApp, then the member’s chat.</Muted>
      {!p.voided ? <Btn label="Void this receipt" kind="danger" onPress={() => setVoiding(true)} /> : null}

      <PromptModal
        visible={voiding}
        title={`Void ${p.receiptNo}?`}
        message="Use this for mistakes (wrong member, wrong amount). The receipt stays on record marked VOID, and its months become unpaid again. This cannot be undone."
        confirmLabel="Void receipt"
        danger
        fields={[{ key: 'reason', label: 'Reason', placeholder: 'e.g. wrong member selected' }]}
        onCancel={() => setVoiding(false)}
        onConfirm={async (v) => {
          const ok = await attempt(() => repo.voidPayment(p.id, v.reason, device.collectorName));
          if (ok !== undefined) {
            setVoiding(false);
            changed();
          }
        }}
      />
    </Screen>
  );
}
