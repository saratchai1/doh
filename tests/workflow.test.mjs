import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGET_DAYS, canAssess, canCreate, canTransition, transitionSpec } from '../server/workflow.mjs';

const order={
  route_team:'รส.สบ.1',
  owner_unit:'วทบ.2',
  source_agency:'สำนักอำนวยความปลอดภัย',
};

test('difficulty SLA targets are stable',()=>{
  assert.deepEqual(TARGET_DAYS,{1:7,2:21,3:30,4:60});
});

test('internal route reaches owner unit',()=>{
  const first=transitionSpec('OFFICE_RECEIVED','RS_ACCEPT',order);
  assert.equal(first.stage,'RS_RECEIVED');
  assert.equal(first.custodian,'รส.สบ.1');
  const second=transitionSpec(first.stage,'UNIT_ACCEPT',order);
  assert.equal(second.stage,'UNIT_RECEIVED');
  assert.equal(second.custodian,'วทบ.2');
});

test('IH branch retains same work order route',()=>{
  const send=transitionSpec('INTERNAL_WORK','SEND_TO_IH',order);
  assert.equal(send.stage,'IH_WAIT_RS_ACCEPT');
  const rs=transitionSpec(send.stage,'RS_ACCEPT_IH',order);
  const outbound=transitionSpec(rs.stage,'RS_SEND_IH',order);
  assert.equal(outbound.stage,'IH_WAIT_RECEIVE');
  assert.equal(outbound.custodian,'In-house Consultant');
});

test('invalid transition is rejected',()=>{
  assert.throws(()=>transitionSpec('OFFICE_RECEIVED','IH_DONE',order),/INVALID_TRANSITION/);
});

test('role boundary separates internal and IH writes',()=>{
  assert.equal(canCreate('STAFF'),true);
  assert.equal(canCreate('IH'),false);
  assert.equal(canAssess('IH','IH'),true);
  assert.equal(canAssess('IH','INITIAL'),false);
  assert.equal(canTransition('IH','IH_DONE'),true);
  assert.equal(canTransition('IH','SEND_SAFETY'),false);
  assert.equal(canTransition('VIEWER','RS_ACCEPT'),false);
});
