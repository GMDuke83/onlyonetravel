import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeRows,filterRows,contactGroups} from '../public/js/operations/workspace.js';

const rows=[
 {id:'1',code:'OO-001',name:'Ada Reise',phone:'+49 111',email:'ada@example.test',status:'new',hasOffer:false,assignedTo:null,from:'',updatedAt:30},
 {id:'2',code:'OO-002',name:'Ada Reise',phone:'+49 111',email:'ada@example.test',status:'offer',hasOffer:true,assignedTo:'Maria',from:'2099-10-12',updatedAt:20},
 {id:'3',code:'OO-003',name:'Ada Reise',phone:'+49 222',email:'',status:'confirmed',hasOffer:true,assignedTo:'Maria',from:'2099-10-03',updatedAt:10}
];
test('workspace scopes keep unconfirmed offers and bookings distinct',()=>{
 assert.deepEqual(scopeRows(rows,'dashboard').map(r=>r.id),['1','2']);
 assert.deepEqual(scopeRows(rows,'quotes').map(r=>r.id),['2','3']);
 assert.deepEqual(scopeRows(rows,'bookings').map(r=>r.id),['3']);
});
test('workspace combines search, status and ownership; undated trips sort last',()=>{
 assert.deepEqual(filterRows(rows,{query:'ada OO-002',state:'offer',assignment:'assigned'}).map(r=>r.id),['2']);
 assert.deepEqual(filterRows(rows,{query:'222',assignment:'unassigned'}),[]);
 assert.deepEqual(filterRows(rows,{order:'travel'}).map(r=>r.id),['3','2','1']);
 assert.deepEqual(rows.map(r=>r.id),['1','2','3']);
});
test('contact index does not merge names with different or missing contact details',()=>{
 const groups=contactGroups([...rows,{...rows[0],id:'4',phone:'',email:''},{...rows[0],id:'5',phone:'',email:''}]);
 assert.equal(groups.length,4);assert.equal(groups[0].rows.length,2);
});
