import React from "react";
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Image as PdfImage,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  InvoiceDocument,
  InvoicePrintSettings,
} from "@/app/(app)/invoices/_components/invoice-print-view";
import { loadPdfStamp } from "./stamp";

Font.register({
  family: "NotoSansJP",
  src: path.join(process.cwd(), "assets/fonts/NotoSansJP-Regular.ttf"),
});
Font.registerHyphenationCallback((word) => {
  const segments: string[] = [];
  for (const char of Array.from(word)) {
    if (/^[、。，．！？!?）)」』】]$/.test(char) && segments.length) segments[segments.length - 1] += char;
    else segments.push(char);
  }
  return segments;
});
const style = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 9,
    lineHeight: 1.5,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 38,
    color: "#172033",
  },
  title: { fontSize: 23, textAlign: "center", marginBottom: 28 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  recipient: { width: "49%" },
  sender: { width: "46%", fontSize: 8 },
  name: {
    fontSize: 13,
    borderBottomWidth: 1,
    borderColor: "#64748b",
    paddingBottom: 6,
    marginBottom: 8,
  },
  amount: {
    marginTop: 24,
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    fontSize: 16,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingVertical: 7,
    fontSize: 8,
    color: "#475569",
  },
  line: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#cbd5e1",
    paddingVertical: 8,
  },
  product: { width: "51%", paddingRight: 12 },
  price: { width: "19%", textAlign: "right", paddingRight: 10 },
  quantity: { width: "10%", textAlign: "right", paddingRight: 10 },
  sum: { width: "20%", textAlign: "right" },
  note: { fontSize: 8, color: "#64748b", marginTop: 3 },
  totals: { marginTop: 15, width: "45%", alignSelf: "flex-end" },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderColor: "#cbd5e1",
  },
  box: { borderWidth: 0.5, borderColor: "#cbd5e1", padding: 10, marginTop: 5 },

});
const yen = (n: number) => new Intl.NumberFormat("ja-JP").format(n);
const date = (d: Date) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo" }).format(d);
export async function renderInvoicePdf(
  invoice: InvoiceDocument,
  settings: InvoicePrintSettings,
) {
  const stamp = await loadPdfStamp(settings.stampImageUrl);
  const bank = [
    [settings.bankName, settings.branchName].filter(Boolean).join(" "),
    [settings.accountType, settings.accountNumber].filter(Boolean).join(" "),
    settings.accountHolder,
  ]
    .filter(Boolean)
    .join("\n");
  const remarks = [invoice.company.paymentTerms, settings.transferNote]
    .filter(Boolean)
    .join("\n\n");
  const totals = [
    ["税抜合計", invoice.subtotal],
    [`消費税（${invoice.taxRate / 100}%）`, invoice.taxAmount],
    ...(invoice.withholdingEnabled
      ? [["源泉所得税", -invoice.withholdingTax]]
      : []),
    ["ご請求金額", invoice.grandTotal],
  ] as [string, number][];
  return renderToBuffer(
    <Document
      title={`請求書 ${invoice.invoiceNumber}`}
      author={settings.companyName}
      language="ja-JP"
    >
      <Page size="A4" style={style.page} wrap>
        <Text style={style.title}>請求書</Text>
        <View style={style.row} wrap={false}>
          <View style={style.recipient}>
            <Text style={style.name}>{invoice.company.name} 御中</Text>
            <Text>件名：{invoice.subject}</Text>
          </View>
          <View style={style.sender}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11 }}>{settings.companyName}</Text>
                {[
                  settings.postalCode ? `〒${settings.postalCode}` : "",
                  settings.address,
                  settings.phone ? `TEL: ${settings.phone}` : "",
                  settings.email,
                  settings.contactPerson,
                  settings.invoiceRegistrationNumber
                    ? `登録番号: ${settings.invoiceRegistrationNumber}`
                    : "",
                ]
                  .filter(Boolean)
                  .map((line, idx) => (
                    <Text key={idx}>{line}</Text>
                  ))}
              </View>
              {stamp && (
                <PdfImage
                  src={{ data: stamp, format: "png" }}
                  style={{ width: 42, height: 42, objectFit: "contain" }}
                />
              )}
            </View>
            <View style={{ marginTop: 12 }}>
              <Text>請求書番号：{invoice.invoiceNumber}</Text>
              <Text>請求日：{date(invoice.issueDate)}</Text>
              <Text>お支払期限：{date(invoice.dueDate)}</Text>
            </View>
          </View>
        </View>
        <Text style={style.amount}>
          ご請求金額　{yen(invoice.grandTotal)} 円
        </Text>
        <View style={style.tableHead} wrap={false}>
          <Text style={style.product}>品目</Text>
          <Text style={style.price}>単価</Text>
          <Text style={style.quantity}>数量</Text>
          <Text style={style.sum}>金額</Text>
        </View>
        {invoice.items.map((item, idx) => (
          <View
            key={item.id}
            style={[
              style.line,
              { backgroundColor: idx % 2 ? "#f8fafc" : "#ffffff" },
            ]}
            wrap={false}
          >
            <View style={style.product}>
              <Text>
                {item.productName}
                {item.unit ? `（${item.unit}）` : ""}
              </Text>
              {item.note && <Text style={style.note}>{item.note}</Text>}
            </View>
            <Text style={style.price}>{yen(item.unitPrice)}</Text>
            <Text style={style.quantity}>{String(item.quantity)}</Text>
            <Text style={style.sum}>{yen(item.amount)}</Text>
          </View>
        ))}
        <View style={style.totals} wrap={false}>
          {totals.map(([label, amount]) => (
            <View key={label} style={style.totalLine}>
              <Text>{label}</Text>
              <Text>{yen(amount)} 円</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 24 }} wrap={false}>
          <Text>税率別内訳（{invoice.taxRate / 100}%）</Text>
          <Text style={style.note}>
            税抜 {yen(invoice.subtotal)} 円　／　消費税 {yen(invoice.taxAmount)}{" "}
            円　／　税込 {yen(invoice.totalWithTax)} 円
          </Text>
        </View>
        <View style={{ marginTop: 20 }} wrap={false}>
          <Text>振込先</Text>
          <Text style={style.box}>{bank || "—"}</Text>
        </View>
        {remarks && (
          <View style={{ marginTop: 16 }} wrap={false}>
            <Text>備考</Text>
            <Text style={style.box}>{remarks}</Text>
          </View>
        )}
      </Page>
    </Document>,
  );
}
