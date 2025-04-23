console.log('🏄 questionController.js loaded');

/**
 * Controller: questionController.js
 * -------------------------------------
 * Handles creation, fetching, and importing of questions into the system.
 *
 * Functions:
 * - createQuestion(): Add a new question with tags (branch, subject, topic, etc.)
 * - bulkUpload(): Import questions from a CSV (supports variable options, tags, marks)
 * - getAllQuestions(): List all questions with optional filters (e.g., subject, topic)
 *
 * Auto-creates hierarchy entities if they don't exist (case-insensitive matching).
 *
 * Works with:
 * - models/Question.js
 * - models/Branch.js, Subject.js, Topic.js, SubTopic.js
 */

const Question = require('../models/Question');
const Branch = require('../models/Branch');
const Subject = require('../models/Subject');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');
const getExamTypeId = require('../utils/getExamTypeId');
const mongoose = require('mongoose');
const ExamType = require('../models/ExamType');

// Create a question
const createQuestion = async (req, res) => {
  try {
    const {
      questionText,
      options,
      correctOption,
      branch,
      subject,
      topic,
      subTopic,
    } = req.body;

    const newQuestion = new Question({
      questionText,
      options,
      correctOption,
      branch,
      subject,
      topic,
      subTopic,
    });

    await newQuestion.save();
    res.status(201).json({ message: 'Question created successfully', question: newQuestion });
  } catch (err) {
    console.error('Error creating question:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ Add a new question
const resolveEntityWithParent = async (Model, name, parentField, parentId) => {
  if (!name || !parentId) return null;

  // Try finding it
  let doc = await Model.findOne({
    name: new RegExp(`^${name}$`, 'i'),
    [parentField]: parentId,
  });

  // Create if not found
  if (!doc) {
    doc = new Model({
      name,
      [parentField]: parentId,
    });
    await doc.save();
  }

  return doc;
};

const addQuestion = async (req, res) => {
  try {
    const {
      questionText,
      options,
      correctOptions,
      branch,
      subject,
      topic,
      subtopic,
      examType,
      difficulty,
      explanation,
      explanations = [],
      marks = 1,
      askedIn = [],
      status = "active",
      version = 1
    } = req.body;

    console.log("📥 Incoming Request Body:", req.body);

    // Step 1: Resolve Entities (string or ObjectId)
    const resolveEntity = async (Model, value, key = "name") => {
      if (!value) return null;
      if (mongoose.Types.ObjectId.isValid(value)) return value;
      let doc = await Model.findOne({ [key]: new RegExp(`^${value}$`, "i") });
      if (!doc) {
        doc = new Model({ [key]: value });
        await doc.save();
      }
      return doc._id;
    };

    const branchDoc = await resolveEntity(Branch, branch);
    const subjectDoc = await resolveEntity(Subject, subject, 'name', { branch: branchDoc._id });
    const topicDoc = await resolveEntityWithParent(Topic, topic, 'subject', subjectDoc?._id);
    const subtopicDoc = await resolveEntityWithParent(SubTopic, subtopic, 'topic', topicDoc?._id);
    const examTypeId = await resolveEntity(ExamType, examType, "code");

    // Step 2: Format options
    const formattedOptions = options.map((opt) => ({
      text: opt.text?.trim(),
      isCorrect: opt.isCorrect
    })).filter(o => o.text); // remove empty options

    // Step 3: Parse correctOptions if it's still string
    let formattedCorrectOptions = correctOptions;
    if (typeof correctOptions === 'string') {
      try {
        formattedCorrectOptions = JSON.parse(correctOptions);
      } catch {
        formattedCorrectOptions = correctOptions.split('|').map(s => s.trim());
      }
    }

    // Step 4: Parse askedIn
    let askedInArray = Array.isArray(askedIn) ? askedIn : [];
    if (typeof askedIn === 'string') {
      try {
        askedInArray = JSON.parse(askedIn);
      } catch {
        askedInArray = [];
      }
    }

    // Step 5: Parse explanations
    let explanationArray = Array.isArray(explanations) ? explanations : [];
    if (typeof explanations === 'string') {
      try {
        explanationArray = JSON.parse(explanations);
      } catch {
        explanationArray = [];
      }
    }

    const question = new Question({
      questionText,
      options: formattedOptions,
      correctOptions: formattedCorrectOptions,
      branch: branchDoc,
      subject: subjectDoc,
      topic: topicDoc,
      subtopic: subtopicDoc,
      examType: examTypeId,
      difficulty,
      explanation,
      explanations: explanationArray,
      marks,
      askedIn: askedInArray,
      status,
      version
    });

    await question.save();
    res.status(201).json(question);

  } catch (error) {
    console.error("❌ Error adding question:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ This function gets all questions
const getAllQuestions = async (req, res) => {
  try {
    const questions = await Question.find()
      .populate('branch',   'name')
      .populate('subject',  'name')
      .populate('topic',    'name')
      .populate('subtopic', 'name');
    return res.json(questions);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// 🔍 Filter questions by hierarchy
const filterQuestions = async (req, res) => {
  try {
    const { branch, subject, topic, subtopic, difficulty } = req.query;

    if (!branch) {
      return res.status(400).json({ message: 'Branch is required to filter questions' });
    }

    const filter = { branch };
    if (subject) filter.subject = subject;
    if (topic) filter.topic = topic;
    if (subtopic) filter.subtopic = subtopic;
    if (difficulty) filter.difficulty = difficulty;

    const questions = await Question.find(filter)
      .populate('branch', 'name')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .populate('subtopic', 'name');

    res.status(200).json(questions);
  } catch (error) {
    console.error('Error filtering questions:', error);
    res.status(500).json({ message: 'Server error while filtering questions' });
  }
};

// ✅ Get a specific question by ID
const getQuestionById = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    res.status(200).json(question);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ Update question
const updateQuestion = async (req, res) => {
  try {
    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updatedQuestion) {
      return res.status(404).json({ message: 'Question not found' });
    }

    res.status(200).json(updatedQuestion);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ Delete question
const deleteQuestion = async (req, res) => {
  try {
    const deleted = await Question.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Question not found' });
    }
    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  addQuestion,
  getAllQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  filterQuestions,
  createQuestion,
};
