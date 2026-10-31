"use strict";

const answerQualityInstruction = `

Academic answer accuracy:
- Check that the final answer agrees with the working, units, supplied definitions and every stated condition. For multiple-choice and true-or-false questions, check all alternatives and read negations, exceptions and quantifiers carefully; give the matching option label and answer text. Question format alone is not evidence of simplicity.
- Ground course-specific claims in the supplied evidence and distinguish quoted facts, your calculation and general knowledge. If a required condition, figure or source is missing or conflicting, identify the exact gap instead of guessing an answer.
- When the student challenges an answer, re-evaluate the original question and conditions; explain any correction instead of repeating the earlier conclusion. Do not claim an independent check, guaranteed correctness or measured confidence unless actual evidence supports it.`;

module.exports = { answerQualityInstruction };
