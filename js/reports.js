export function dailySalesReport(state, date, salesmanId = "") {
  const orders = state.orders.filter(
    (order) =>
      order.status === "confirmed" &&
      !order.deleted_at &&
      order.date === date &&
      (!salesmanId || order.salesman_id === salesmanId),
  );
  const orderById = new Map(state.orders.map((order) => [order.id, order]));
  const invoiceById = new Map(state.invoices.map((invoice) => [invoice.id, invoice]));
  const invoiceByOrder = new Map(
    state.invoices.map((invoice) => [invoice.order_id, invoice]),
  );
  const paymentRows = state.payments
    .filter((payment) => payment.date === date && !payment.voided_at)
    .map((payment) => {
      const invoice = invoiceById.get(payment.invoice_id);
      const order = invoice && orderById.get(invoice.order_id);
      return order && (!salesmanId || order.salesman_id === salesmanId)
        ? { payment, invoice, order }
        : null;
    })
    .filter(Boolean);
  const salesPaisa = orders.reduce(
    (sum, order) => sum + Number(order.total_paisa || 0),
    0,
  );
  const sameDayPayments = paymentRows.filter(({ order }) => order.date === date);
  const previousRecoveryPaisa = paymentRows
    .filter(({ order }) => order.date < date)
    .reduce((sum, row) => sum + Number(row.payment.amount_paisa || 0), 0);
  const sameDayCollectionPaisa = sameDayPayments.reduce(
    (sum, row) => sum + Number(row.payment.amount_paisa || 0),
    0,
  );
  const collectedPaisa = paymentRows.reduce(
    (sum, row) => sum + Number(row.payment.amount_paisa || 0),
    0,
  );
  const newCreditPaisa = orders.reduce((sum, order) => {
    const invoice = invoiceByOrder.get(order.id);
    const paid = sameDayPayments
      .filter((row) => row.invoice.id === invoice?.id)
      .reduce((amount, row) => amount + Number(row.payment.amount_paisa || 0), 0);
    return sum + Math.max(0, Number(order.total_paisa || 0) - paid);
  }, 0);
  const expenses = state.expenses.filter(
    (expense) =>
      !expense.deleted_at &&
      expense.date === date &&
      (!salesmanId || expense.salesman_id === salesmanId),
  );
  const expensePaisa = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount_paisa || 0),
    0,
  );
  const outstandingPaisa = state.invoices.reduce((sum, invoice) => {
    const order = orderById.get(invoice.order_id);
    if (
      !order ||
      order.status !== "confirmed" ||
      order.date > date ||
      (salesmanId && order.salesman_id !== salesmanId)
    )
      return sum;
    const paid = state.payments
      .filter(
        (payment) =>
          payment.invoice_id === invoice.id &&
          payment.date <= date &&
          !payment.voided_at,
      )
      .reduce((amount, payment) => amount + Number(payment.amount_paisa || 0), 0);
    return sum + Math.max(0, Number(invoice.total_paisa || 0) - paid);
  }, 0);
  const overduePaisa = state.invoices.reduce((sum, invoice) => {
    const order = orderById.get(invoice.order_id);
    if (
      !order ||
      order.status !== "confirmed" ||
      order.date > date ||
      order.due_date >= date ||
      (salesmanId && order.salesman_id !== salesmanId)
    )
      return sum;
    const paid = state.payments
      .filter(
        (payment) =>
          payment.invoice_id === invoice.id &&
          payment.date <= date &&
          !payment.voided_at,
      )
      .reduce((amount, payment) => amount + Number(payment.amount_paisa || 0), 0);
    return sum + Math.max(0, Number(invoice.total_paisa || 0) - paid);
  }, 0);
  const productTotals = new Map();
  for (const order of orders) {
    for (const item of state.order_items.filter((line) => line.order_id === order.id)) {
      const row = productTotals.get(item.product_id) || {
        product_id: item.product_id,
        product_name: item.product_name,
        boxes: 0,
        amount_paisa: 0,
      };
      row.boxes += Number(item.boxes || 0);
      row.amount_paisa += Number(item.amount_paisa || 0);
      productTotals.set(item.product_id, row);
    }
  }
  const customerTotals = new Map();
  for (const order of orders) {
    const row = customerTotals.get(order.customer_id) || {
      customer_id: order.customer_id,
      sales_paisa: 0,
    };
    row.sales_paisa += Number(order.total_paisa || 0);
    customerTotals.set(order.customer_id, row);
  }
  for (const { payment, order } of paymentRows) {
    const row = customerTotals.get(order.customer_id) || {
      customer_id: order.customer_id,
      sales_paisa: 0,
    };
    row.collected_paisa = (row.collected_paisa || 0) + Number(payment.amount_paisa || 0);
    customerTotals.set(order.customer_id, row);
  }
  const stockTotals = new Map();
  const stockBySalesman = new Map();
  for (const movement of state.salesman_stock_movements || []) {
    if (movement.date > date || (salesmanId && movement.salesman_id !== salesmanId))
      continue;
    const product =
      state.products?.find((row) => row.id === movement.product_id) ||
      state.order_items.find((row) => row.product_id === movement.product_id);
    const productRow = stockTotals.get(movement.product_id) || {
      product_id: movement.product_id,
      product_name: product?.name || product?.product_name || movement.product_id,
      opening_boxes: 0,
      issued_boxes: 0,
      sold_boxes: 0,
      returned_boxes: 0,
      damaged_boxes: 0,
      closing_boxes: 0,
    };
    const boxes = Number(movement.boxes || 0);
    if (movement.date < date) productRow.opening_boxes += boxes;
    else if (movement.kind === "issue") productRow.issued_boxes += boxes;
    else if (movement.kind === "sale") productRow.sold_boxes -= boxes;
    else if (movement.kind === "return_saleable") productRow.returned_boxes -= boxes;
    else if (movement.kind.startsWith("return_")) productRow.damaged_boxes -= boxes;
    productRow.closing_boxes += boxes;
    stockTotals.set(movement.product_id, productRow);
    const salesmanRow = stockBySalesman.get(movement.salesman_id) || {
      salesman_id: movement.salesman_id,
      closing_boxes: 0,
      issued_boxes: 0,
      returned_boxes: 0,
    };
    salesmanRow.closing_boxes += boxes;
    if (movement.date === date && movement.kind === "issue")
      salesmanRow.issued_boxes += boxes;
    if (movement.date === date && movement.kind.startsWith("return_"))
      salesmanRow.returned_boxes -= boxes;
    stockBySalesman.set(movement.salesman_id, salesmanRow);
  }
  const stockByProduct = [...stockTotals.values()].sort((a, b) =>
    a.product_name.localeCompare(b.product_name),
  );
  const stockBySalesmanRows = [...stockBySalesman.values()].sort((a, b) =>
    a.salesman_id.localeCompare(b.salesman_id),
  );
  return {
    date,
    salesman_id: salesmanId || null,
    sales_paisa: salesPaisa,
    collected_paisa: collectedPaisa,
    same_day_collection_paisa: sameDayCollectionPaisa,
    previous_recovery_paisa: previousRecoveryPaisa,
    new_credit_paisa: newCreditPaisa,
    expense_paisa: expensePaisa,
    outstanding_paisa: outstandingPaisa,
    overdue_paisa: overduePaisa,
    cash_collected_paisa: paymentRows
      .filter(({ payment }) => payment.method === "Cash")
      .reduce((sum, row) => sum + Number(row.payment.amount_paisa || 0), 0),
    stock_issued_boxes: stockByProduct.reduce((sum, row) => sum + row.issued_boxes, 0),
    stock_returned_boxes: stockByProduct.reduce(
      (sum, row) => sum + row.returned_boxes + row.damaged_boxes,
      0,
    ),
    stock_by_product: stockByProduct,
    stock_by_salesman: stockBySalesmanRows,
    salesmen: [...new Set(orders.map((order) => order.salesman_id).filter(Boolean))],
    products: [...productTotals.values()].sort((a, b) =>
      a.product_name.localeCompare(b.product_name),
    ),
    customers: [...customerTotals.values()].sort(
      (a, b) => b.sales_paisa - a.sales_paisa,
    ),
    orders,
    payments: paymentRows.map((row) => row.payment),
    expenses,
  };
}