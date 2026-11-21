const { Schema } = require('@tiptap/pm/model');
const paragraphAttrs = { textAlign: {default:null}, lineHeight:{default:null}, firstLine:{default:0}, spaceBefore:{default:0}, spaceAfter:{default:0} };
const cellAttrs = { colspan:{default:1}, rowspan:{default:1}, colwidth:{default:null} };
const schema = new Schema({
  nodes: {
    doc:{content:'block+'}, text:{group:'inline'},
    paragraph:{group:'block',content:'inline*',attrs:paragraphAttrs},
    heading:{group:'block',content:'inline*',attrs:{...paragraphAttrs,level:{default:1}}},
    bulletList:{group:'block',content:'listItem+'}, orderedList:{group:'block',content:'listItem+',attrs:{start:{default:1},type:{default:null}}},
    listItem:{content:'paragraph block*'}, blockquote:{group:'block',content:'block+'},
    hardBreak:{group:'inline',inline:true,selectable:false}, horizontalRule:{group:'block'},
    codeBlock:{group:'block',content:'text*',marks:'',code:true,attrs:{language:{default:null}}},
    image:{group:'block',attrs:{src:{},alt:{default:null},title:{default:null},width:{default:null},height:{default:null}}},
    table:{group:'block',content:'tableRow+',isolating:true}, tableRow:{content:'(tableCell | tableHeader)*'},
    tableCell:{content:'block+',attrs:cellAttrs,isolating:true}, tableHeader:{content:'block+',attrs:cellAttrs,isolating:true},
  }, marks:{ bold:{},italic:{},underline:{},strike:{},code:{},textStyle:{attrs:Object.fromEntries(['fontFamily','fontSize','color','backgroundColor'].map(k=>[k,{default:null}]))} },
});
module.exports = { schema };
