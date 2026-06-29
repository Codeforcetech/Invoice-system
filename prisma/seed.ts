import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@example.com";
  const adminPassword = "admin12345";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: UserRole.ADMIN },
    create: {
      name: "管理者",
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
    },
  });

  const userEmail = "test@example.com";
  const userPassword = "password123";
  const userPasswordHash = await bcrypt.hash(userPassword, 12);

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      name: "テストユーザー",
      email: userEmail,
      passwordHash: userPasswordHash,
      role: UserRole.USER,
    },
  });

  const defaultSetting = {
    companyName: "自社サンプル株式会社",
    invoiceRegistrationNumber: "T1234567890123",
    postalCode: "100-0001",
    address: "東京都千代田区サンプル1-2-3",
    phone: "03-0000-0000",
    email: "billing@example.com",
    contactPerson: "経理担当",
    stampImageUrl: "",
    bankName: "みずほ銀行",
    branchName: "東京支店",
    accountType: "普通",
    accountNumber: "1234567",
    accountHolder: "ジシャサンプル（カ",
    accountHolderKana: "ジシャサンプルカブシキガイシャ",
    transferNote: "振込手数料は貴社ご負担にてお願いいたします。",
    taxRate: 1000,
  };

  for (const account of [admin, user]) {
    await prisma.systemSetting.upsert({
      where: { userId: account.id },
      update: {},
      create: {
        userId: account.id,
        ...defaultSetting,
      },
    });
  }

  const companies: Array<{
    name: string;
    invoiceCode: string;
    defaultDueDays: number;
    paymentTerms: string;
    commonSubject: string;
    billingEmail: string;
    billingCcEmail: string | null;
  }> = [
    {
      name: "株式会社コードフォース",
      invoiceCode: "CODEFORCE",
      defaultDueDays: 30,
      paymentTerms: "月末締め翌月末払い。振込手数料は貴社ご負担でお願いいたします。",
      commonSubject: "システム開発・保守費（月額）",
      billingEmail: "keiri@codeforce.example.com",
      billingCcEmail: null,
    },
    {
      name: "サンプル商事株式会社",
      invoiceCode: "SAMPLETRD",
      defaultDueDays: 45,
      paymentTerms: "請求書到着後30日以内にお振込ください。",
      commonSubject: "広告運用代行費",
      billingEmail: "accounting@sampletrd.example.com",
      billingCcEmail: "manager@sampletrd.example.com",
    },
    {
      name: "テスト制作合同会社",
      invoiceCode: "TESTWORKS",
      defaultDueDays: 14,
      paymentTerms: "前払い。振込確認後に作業開始。",
      commonSubject: "デザイン制作費",
      billingEmail: "office@testworks.example.com",
      billingCcEmail: null,
    },
  ];

  for (const c of companies) {
    await prisma.company.upsert({
      where: {
        userId_invoiceCode: {
          userId: user.id,
          invoiceCode: c.invoiceCode,
        },
      },
      update: {
        name: c.name,
        defaultDueDays: c.defaultDueDays,
        paymentTerms: c.paymentTerms,
        commonSubject: c.commonSubject,
        billingEmail: c.billingEmail,
        billingCcEmail: c.billingCcEmail,
      },
      create: {
        userId: user.id,
        name: c.name,
        invoiceCode: c.invoiceCode,
        defaultDueDays: c.defaultDueDays,
        paymentTerms: c.paymentTerms,
        commonSubject: c.commonSubject,
        billingEmail: c.billingEmail,
        billingCcEmail: c.billingCcEmail,
      },
    });
  }

  await prisma.invoiceItemTemplate.deleteMany({ where: { userId: user.id } });
  await prisma.invoiceItemTemplate.createMany({
    data: [
      {
        userId: user.id,
        name: "Web保守費（月額）",
        productName: "Webサイト保守・運用",
        unit: "月",
        quantity: new Prisma.Decimal(1),
        unitPrice: 50000,
        note: "サーバー・SSL・軽微改修含む",
      },
      {
        userId: user.id,
        name: "広告運用費",
        productName: "広告運用代行",
        unit: "月",
        quantity: new Prisma.Decimal(1),
        unitPrice: 80000,
        note: "",
      },
      {
        userId: user.id,
        name: "デザイン修正費",
        productName: "デザイン修正（スポット）",
        unit: "式",
        quantity: new Prisma.Decimal(1),
        unitPrice: 30000,
        note: "",
      },
      {
        userId: user.id,
        name: "システム保守費",
        productName: "システム保守",
        unit: "月",
        quantity: new Prisma.Decimal(1),
        unitPrice: 100000,
        note: "監視・障害対応・月次レポート",
      },
    ],
  });

  await prisma.mailTemplate.deleteMany({ where: { userId: user.id } });
  await prisma.mailTemplate.create({
    data: {
      userId: user.id,
      name: "標準（請求書送付）",
      subjectTemplate: "【請求書】{{company_name}} {{invoice_number}}",
      bodyTemplate: `{{company_name}} 御中

いつもお世話になっております。
下記の通り請求書を送付いたします。

件名: {{subject}}
請求書番号: {{invoice_number}}
請求日: {{issue_date}}
支払期限: {{due_date}}
ご請求金額: {{grand_total}}円（税込）

帳票URL: {{print_url}}

{{payment_terms}}
`,
    },
  });

  console.log("Seed completed.");
  console.log(`Admin Login: ${adminEmail} / ${adminPassword}`);
  console.log(`User Login: ${userEmail} / ${userPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
