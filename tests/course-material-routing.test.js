'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolve,codes}=require('../lib/course-material-routing');
const courses=[{id:'a',name:'MAT135H1 Calculus'},{id:'b',name:'ECO101 Economics'},{id:'general',chatType:'general',name:'MAT135H1'}];
test('course codes match filenames, spacing and term suffixes without matching code prefixes',()=>{
 assert.deepEqual(codes('mat_135H1F_lecture02.pdf'),['MAT135H1']);
 assert.equal(resolve(courses,'MAT-135H1_week1.pdf','Prerequisites ECO101').courseId,'a');
 assert.equal(resolve(courses,'MAT135_notes.pdf','').courseId,'a');
 assert.equal(resolve(courses,'MAT1350.pdf','').courseId,null);
 assert.equal(resolve(courses,'lecture.pdf','Course: ECO 101\nIntroduction').courseId,'b');
 assert.equal(resolve(courses,'week02.pdf','ECO101 Introduction. Year 2026 at 10:00 on March 12').courseId,'b');
});
test('ambiguous semesters, campus codes, multiple and unknown codes need explicit choice',()=>{
 assert.equal(resolve([...courses,{id:'fall',name:'MAT135H1',term:'Fall'}],'MAT135H1.pdf','').courseId,null);
 assert.equal(resolve([...courses,{id:'campus',name:'MAT135H5'}],'MAT135.pdf','').courseId,null);
 assert.equal(resolve(courses,'MAT135H1_ECO101.pdf','').courseId,null);
 assert.equal(resolve(courses,'MAT135H1_PHY999.pdf','').courseId,null);
 assert.equal(resolve(courses,'lecture.pdf','No readable text').reason,'missing-code');
});
