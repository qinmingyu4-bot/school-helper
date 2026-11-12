"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument, PDFName, PDFString, StandardFonts } = require("pdf-lib");
const L = require("../public/grade-locations");
const { readPdfSources } = require("../lib/grade-source-pdf");
const { parseRecognition } = require("../lib/grade-preview-recognition");
const { createGradePlanner } = require("../lib/grade-planner-service");

test("grade lookup uses explicit destinations, category scope and source positions without inventing platform links", () => {
  const text = "Homework grades are posted at https://gradescope.example.edu/courses/123.\nQuiz marks can be viewed at https://canvas.example.edu/courses/123/quizzes.\nMidterm results are available in Quercus > Grades.\nAll course grades can be checked at https://canvas.example.edu/courses/123/grades.\nSubmit your final exam at https://submission.example.edu/final.\nRead the research results at https://research.example.edu/paper.\nDo not check grades at https://old.example.edu/grades.";
  const sources=L.discover([{title:"Syllabus.pdf",documentId:"doc1",text,sourcePages:[{page:3,start:0,end:text.length}]}]);
  assert.equal(sources.length,4);
  const hw=L.forCategory(sources,{name:"Homework"}); assert.equal(hw.length,2); assert.equal(hw[0].url,"https://gradescope.example.edu/courses/123");
  assert.equal(hw[0].sourceName,"Syllabus.pdf"); assert.equal(hw[0].page,3); assert.match(hw[0].quote,/Homework grades/);
  assert.equal(L.forCategory(sources,{name:"Quiz"}).some(x=>/gradescope/.test(x.url)),false);
  const mid=L.forCategory(sources,{name:"Midterm"}); assert.equal(mid.find(x=>!x.url).quote,"Midterm results are available in Quercus > Grades.");
  const final=L.forCategory(sources,{name:"Final"}); assert.equal(final.length,1); assert.match(final[0].url,/\/grades$/);
});

test("links on a separate line inherit only the adjacent explicit grade direction", () => {
  const links=L.discover([{title:"Quiz instructions.txt",text:"Quiz grades can be checked here:\nhttps://lms.example.edu/quizzes\n\nCourse homepage\nhttps://homepage.example.edu/"}]);
  assert.equal(links.length,1); assert.match(links[0].quote,/Quiz grades/);
  assert.equal(L.forCategory(links,"Homework").length,0);
  const labelled=L.discover([{title:"Grade links",text:"Homework grades: https://lms.example.edu/homework\nQuiz grades: 10% of course grade https://policy.example.edu/quiz"}]);
  assert.equal(labelled.length,1); assert.equal(labelled[0].url,"https://lms.example.edu/homework");
});

test("lookup sentences keep homework links separate from final directions in the same paragraph",()=>{
  const found=L.discover([{title:"Announcements",text:"Homework grades are posted at https://lms.example.edu/hw. Final grades can be viewed in Quercus > Grades."}]);
  assert.equal(found.length,2);
  assert.deepEqual(L.forCategory(found,"Homework").map(ref=>ref.url),["https://lms.example.edu/hw"]);
  const final=L.forCategory(found,"Final");assert.equal(final.length,1);assert.equal(final[0].url,"");assert.match(final[0].quote,/^Final grades/);
});

test("unsafe destinations are rejected and reviewed syllabus links preserve only known fields", () => {
  for(const url of ["javascript:alert(1)","data:text/html,hello","//evil.test/grades","https://user:secret@example.edu/grades","https://example.edu/\\evil","https://example.edu/a\nb"]) assert.equal(L.safeUrl(url),"");
  assert.equal(L.safeUrl("www.example.edu/grades"),"https://www.example.edu/grades");
  const parentheses=L.discover([{title:"Directions",text:"Homework grades are posted at https://lms.example.edu/grades/unit(1)."}]);
  assert.equal(parentheses[0].url,"https://lms.example.edu/grades/unit(1)");
  const parsed=parseRecognition("syllabus",JSON.stringify({categories:[{name:"Quiz",weight:100,method:"equal",plannedCount:1,gradeLinks:[{url:"javascript:alert(1)"},{url:"https://lms.example.edu/quiz",label:"Quiz grades",quote:"Quiz grades are here.",page:2,token:"never retain"}]}]}));
  assert.equal(parsed.categories[0].gradeLinks.length,1); assert.equal(parsed.categories[0].gradeLinks[0].page,2); assert.equal(parsed.categories[0].gradeLinks[0].token,undefined);
});

test("syllabus review keeps evidenced grade destinations and instructions, rejecting invented and wrong-category URLs", async () => {
  const text="Homework grades can be checked at https://gradescope.example.edu/hw.\nQuiz scores can be viewed at https://quiz.example.edu/marks.\nFinal exam grades are posted in Quercus > Grades.";
  const result={categories:[
    {name:"Homework",weight:40,method:"equal",plannedCount:1,gradeLinks:[{url:"https://invented.example.edu/grades"},{url:"https://quiz.example.edu/marks"}]},
    {name:"Quiz",weight:10,method:"equal",plannedCount:1},
    {name:"Final exam",weight:50,method:"equal",plannedCount:1,gradeDirections:[{quote:"Final exam grades are posted in Quercus > Grades."}]}
  ]};
  let requests=0;
  const service=createGradePlanner({db:{getCourse:async(userId,courseId)=>userId==="alice"&&courseId==="course"?{id:courseId}:null},apiKey:"fixture",model:"fixture",request:async()=>{requests++;return Response.json({output:[{content:[{type:"output_text",text:JSON.stringify(result)}]}]});}});
  const parsed=await service.recognize("alice","course",{kind:"syllabus",name:"Course syllabus.txt",mime:"text/plain",dataUrl:`data:text/plain;base64,${Buffer.from(text).toString("base64")}`});
  assert.equal(requests,1);
  assert.deepEqual(parsed.categories[0].gradeLinks.map(link=>link.url),["https://gradescope.example.edu/hw"]);
  assert.equal(parsed.categories[0].gradeLinks[0].sourceName,"Course syllabus.txt");
  assert.equal(parsed.categories[1].gradeLinks[0].url,"https://quiz.example.edu/marks");
  assert.equal(parsed.categories[2].gradeLinks.length,0);
  assert.equal(parsed.categories[2].gradeDirections[0].quote,"Final exam grades are posted in Quercus > Grades.");
  await assert.rejects(service.recognize("bob","course",{},undefined),{statusCode:404});
});

test("original PDF URI annotations are found even when the visible text only says here", async () => {
  const pdf=await PDFDocument.create(), font=await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612,792]).drawText("Course overview",{x:50,y:700,font,size:12});
  const page=pdf.addPage([612,792]);
  page.drawText("Homework grades can be viewed here.",{x:50,y:700,font,size:12});
  const link=pdf.context.obj({Type:"Annot",Subtype:"Link",Rect:[220,698,280,714],A:{Type:"Action",S:"URI",URI:PDFString.of("https://gradescope.example.edu/courses/789")}});
  page.node.set(PDFName.of("Annots"),pdf.context.obj([pdf.context.register(link)]));
  const bytes=Buffer.from(await pdf.save({useObjectStreams:false}));
  const sources=await readPdfSources(bytes,"Hidden-link syllabus.pdf");
  const found=L.forCategory(L.discover(sources),"Homework");
  assert.equal(found.length,1); assert.equal(found[0].url,"https://gradescope.example.edu/courses/789"); assert.equal(found[0].page,2); assert.match(found[0].quote,/Homework grades/);
  let reads=0, present=true;
  const service=createGradePlanner({db:{getCourse:async()=>({id:"course"}),listDocuments:async()=>present?[{id:"doc",title:"Original.pdf",text:"Course overview",hasSourcePdf:true,updatedAt:"v1"}]:[],readMaterial:async()=>{reads++;return {dataUrl:`data:application/pdf;base64,${bytes.toString("base64")}`};}}});
  const first=await service.locations("alice","course"), second=await service.locations("alice","course");
  assert.equal(first.locations[0].page,2); assert.deepEqual(second,first); assert.equal(reads,1);
  present=false; assert.equal((await service.locations("alice","course")).locations.length,0);
});


test("medical and absence links are rejected in discovery, AI output and legacy display", () => {
  const medical = { url: "http://www.illnessverification.utoronto.ca", quote: "Quiz grades are available here. For information on Absence Declaration Tool for A&S https://www.artsci.utoronto.ca", origin: "syllabus" };
  assert.equal(L.isGradeLocation(medical), false);
  assert.equal(L.isGradeLocation({ ...medical, url: "https://www.artsci.utoronto.ca" }), false);
  assert.equal(L.isGradeLocation({ ...medical, origin: "manual" }), true);
  assert.equal(L.isGradeLocation({ url: "https://www.example.edu", quote: "Course information", origin: "syllabus" }), false);
  const source = { title: "Syllabus", text: "Quiz grades can be viewed at https://canvas.example.edu/grades; medical certificates use http://www.illnessverification.utoronto.ca. For information on Absence Declaration see https://www.artsci.utoronto.ca.",
    links: [medical, { url: "https://www.artsci.utoronto.ca", context: medical.quote }] };
  assert.deepEqual(L.discover([source]).filter(link => link.url).map(link => link.url), ["https://canvas.example.edu/grades"]);
  const parsed = parseRecognition("syllabus", JSON.stringify({ categories: [{ name: "Quiz", weight: 100, gradeLinks: [medical] }] }));
  assert.deepEqual(parsed.categories[0].gradeLinks, []);
});
