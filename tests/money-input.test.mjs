import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoneyInput,formatMoneyInput} from '../assets/js/money-input.js';
test('rupiah entry preserves grouping and cents without guessing malformed values',()=>{
 for(const [text,value] of [['1000000',1000000],['1.000.000',1000000],['285.300,34',285300.34],['285300.34',285300.34],['Rp 4.263.445,96',4263445.96],['0,01',0.01],['1.000',1000],['1,',1]])assert.equal(parseMoneyInput(text),value,text);
 for(const text of ['', 'abc100','1,234.56','1.23.456','1,234','-100','1e6','1 000'])assert(Number.isNaN(parseMoneyInput(text)),text);
 assert.equal(formatMoneyInput('1000000'),'1.000.000');assert.equal(formatMoneyInput('285300,34'),'285.300,34');assert.equal(formatMoneyInput('1000,'),'1.000,');assert.equal(formatMoneyInput('1000,00'),'1.000,00');assert.equal(formatMoneyInput('abc100'),'abc100');
});
