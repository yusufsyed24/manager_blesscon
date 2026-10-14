import { it, expect } from "vitest";
import { empty, localApply } from "../js/store.js";
import { uid, today } from "../js/domain.js";

function setup(status, amount=0) {
  const s=empty(), user={id:uid(),role:"admin",name:"QA",email:"qa@example.test",practice:true};
  s.products.push({id:"P",name:"Test Candy",active:true,boxes_per_carton:1,cost_paisa:20000,retail_paisa:120000,wholesale_paisa:100000,version:1});
  s.salesmen.push({id:"S",name:"QA Salesman",active:true,user_id:user.id});
  s.customers.push({id:"C",name:"QA Customer"});
  s.stock_movements.push({id:uid(),transaction_id:"OPEN",product_id:"P",date:today(),boxes:100,kind:"opening"});
  const id=uid(), op={id:uid(),kind:"order.save",data:{id,customer_id:"C",salesman_id:"S",date:today(),due_date:today(),channel:"wholesale",discount_paisa:0,items:[{product_id:"P",cartons:1,loose_boxes:0}],payment:{status,amount_paisa:amount,transaction_id:"PAY-"+id,date:today(),method:"Cash",received_by:"QA"}}};
  const result=localApply(s,op,user);
  return {state:result.state,order:result.result};
}
it("order sale records Paid, Part paid and Unpaid atomically",()=>{
  const paid=setup("paid"), part=setup("partial",40000), unpaid=setup("unpaid");
  expect(paid.state.payments).toHaveLength(1); expect(paid.state.payments[0].amount_paisa).toBe(100000);
  expect(part.state.payments).toHaveLength(1); expect(part.state.payments[0].amount_paisa).toBe(40000);
  expect(unpaid.state.payments).toHaveLength(0);
});
it("rejects zero and full-total part payments",()=>{
  expect(()=>setup("partial",0)).toThrow(/Part payment/);
  expect(()=>setup("partial",100000)).toThrow(/Part payment/);
});
it("product.save persists product fields and restores deleted tiers",()=>{
  const s=empty(),user={id:uid(),role:"admin",practice:true};
  s.products.push({id:"P",name:"Old",active:true,boxes_per_carton:24,cost_paisa:1,retail_paisa:2,wholesale_paisa:3,version:1});
  s.price_tiers.push({id:"P:0",product_id:"P",min_cartons:0,label:"Base",rate_paisa:3,version:1,deleted_at:"yesterday"});
  const op={id:uid(),kind:"product.save",data:{record:{id:"P",name:"New",active:false,boxes_per_carton:12,cost_paisa:10,retail_paisa:20,wholesale_paisa:15,expiry_date:null},expected_version:1,tiers:[{id:"P:0",product_id:"P",min_cartons:0,label:"Base",rate_paisa:15}]}};
  const out=localApply(s,op,user).state;
  expect(out.products[0]).toMatchObject({name:"New",active:false,boxes_per_carton:12,cost_paisa:10});
  expect(out.price_tiers[0]).toMatchObject({rate_paisa:15,deleted_at:null});
});
