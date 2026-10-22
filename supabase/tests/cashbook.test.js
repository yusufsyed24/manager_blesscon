import { describe, expect, it } from "vitest";
import { A, B, database } from "./db-helper.js";

describe("Cash & Bank Book ledger", () => {
  it("posts invoice receivable, payment receipt, recovery, and salesman expense exactly once", async () => {
    const db = await database();
    await db.exec(`
      insert into public.salesmen(id,name,user_id,joining_date) values('SELLER-1','Seller','${B}','2026-01-01');
      insert into public.customers(id,name,salesman_id) values('CUSTOMER-1','Customer','SELLER-1');
      insert into public.orders(id,number,customer_id,salesman_id,date,due_date,channel,status,total_paisa)
      values('10000000-0000-4000-8000-000000000001','ORD-1','CUSTOMER-1','SELLER-1','2026-10-17','2026-10-24','retail','confirmed',10000);
      insert into public.invoices(id,order_id,number,total_paisa)
      values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INV-1',10000);
      insert into public.payments(id,transaction_id,invoice_id,date,amount_paisa,method,received_by,created_by)
      values('30000000-0000-4000-8000-000000000001','PAY-1','20000000-0000-4000-8000-000000000001','2026-10-17',3000,'Cash','Seller','${B}');
      insert into public.expenses(id,date,category,description,amount_paisa,method,salesman_id,created_by)
      values('EXP-1','2026-10-17','Transport','Fuel',500,'Cash','SELLER-1','${B}');
    `);
    await db.query(
      "select private.add_payment($1::jsonb)",
      [JSON.stringify({invoice_id:"20000000-0000-4000-8000-000000000001",transaction_id:"PAY-2",date:"2026-10-17",amount_paisa:1000,method:"Bank",cashbook_account_key:"bank_default",reference:"BANK-1",received_by:"Owner"})],
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);
    await db.query(
      "select public.cashbook_record_command($1::uuid,'cashbook.handover',$2::jsonb)",
      ["45000000-0000-4000-8000-000000000001", JSON.stringify({source_account:"salesman:SELLER-1:cash",amount_paisa:1000,date:"2026-10-17",reference:"HAND-1",description:"Handover"})],
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false)`);
    const balances = await db.query(`
      select account_key, sum(amount_paisa)::bigint as balance
      from public.cashbook_entries
      group by account_key
    `);
    const map = Object.fromEntries(balances.rows.map(r => [r.account_key, Number(r.balance)]));
    expect(map.market_credit).toBe(6000);
    expect(map["salesman:SELLER-1:cash"]).toBe(1500);
    expect(map.cash_hand).toBe(1000);
    expect(map.bank_default).toBe(1000);
    const count = await db.query("select count(*)::int as n from public.cashbook_entries where source_id='30000000-0000-4000-8000-000000000001'");
    expect(count.rows[0].n).toBe(2);
    await db.query(
      "select public.cashbook_record_command($1::uuid,'cashbook.close.submit',$2::jsonb)",
      ["50000000-0000-4000-8000-000000000001", JSON.stringify({date:"2026-10-17",notes:"Verified physical count",actuals:[{account_key:"salesman:SELLER-1:cash",actual_balance_paisa:1600}]})],
    );
    const closing = await db.query("select id,expected_balance_paisa,variance_paisa from public.cashbook_daily_closings where account_key='salesman:SELLER-1:cash' and business_date='2026-10-17'");
    expect(Number(closing.rows[0].expected_balance_paisa)).toBe(1500);
    expect(Number(closing.rows[0].variance_paisa)).toBe(100);
    await db.query(
      "select public.cashbook_record_command($1::uuid,'cashbook.close.approve',$2::jsonb)",
      ["60000000-0000-4000-8000-000000000001", JSON.stringify({closing_id:closing.rows[0].id})],
    );
    const reconciled = await db.query("select sum(amount_paisa)::bigint as balance from public.cashbook_entries where account_key='salesman:SELLER-1:cash'");
    expect(Number(reconciled.rows[0].balance)).toBe(1600);
    await expect(db.exec(`
      insert into public.expenses(id,date,category,description,amount_paisa,method,salesman_id,created_by)
      values('EXP-LATE','2026-10-17','Transport','Late expense',100,'Cash','SELLER-1','${B}');
    `)).rejects.toThrow(/approved for account/i);
    await db.close();
  });

  it("records a transfer as equal and opposite entries", async () => {
    const db = await database();
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,created_by)
      values('test-opening','TEST-OPEN','2026-10-17','cash_hand',20000,'adjustment','test','TEST-OPEN','Opening balance', '${A}');`);
    const op = "40000000-0000-4000-8000-000000000001";
    await db.query(
      "select public.cashbook_record_command($1::uuid,'cashbook.transfer',$2::jsonb)",
      [op, JSON.stringify({source_account:"cash_hand",destination_account:"bank_default",amount_paisa:12500,date:"2026-10-17",reference:"DEP-1",description:"Deposit"})],
    );
    const rows = await db.query("select account_key,amount_paisa from public.cashbook_entries where transaction_id=$1 order by account_key", [op]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.reduce((sum,r)=>sum+Number(r.amount_paisa),0)).toBe(0);
    expect(rows.rows.map(r=>Number(r.amount_paisa)).sort((a,b)=>a-b)).toEqual([-12500,12500]);
    await db.close();
  });
});
