const { Contest, Assignment, Problem, Submit, UserInfo } = require('../../../../models');
const { createResponse } = require('../../../../utils/response');
const { hasRole } = require('../../../../utils/permission');
const { updateFilesByIds, updateFilesByUrls, removeFilesByUrls, removeFilesByIds } = require('../../../../utils/file');
const {
  PROBLEM_NOT_FOUND,
  AFTER_TEST_START,
} = require('../../../../errors');
const asyncHandler = require('express-async-handler');
const {
  producingSubmit,
  checkOwnerOf,
  validateParentOf,
  validateByProblem,
  removeProblemAt,
  parentModels,
  assignTo,
  checkTestPeriodOf
} = require('./service');

const getProblems = asyncHandler(async (req, res, next) => {
  const { query, query : { parentType }} = req;
  const documents = await Problem.search(query, {
    $and: [{ published: { $ne: null } }, { published: { $lte: now } }, { parentType: parentType }]
  }, [{ path: 'parentId'}, { path: 'writer', model: UserInfo }])
  res.json(createResponse(res, documents));
});

const getProblem = asyncHandler(async (req, res, next) => {
  const { params: { id }, user } = req;
  const problem = await Problem.findById(id);
  if (!problem) return next(PROBLEM_NOT_FOUND);
  const query = Problem.findById(id).populate({ path: 'writer' });
  if (hasRole(user) || checkOwnerOf(problem, user)){
    query.populate({ path: 'ioSet.inFile' })
      .populate({ path: 'ioSet.outFile' });
  }
  const doc = await query.exec();
  res.json(createResponse(res, doc));
});


const createSubmit = asyncHandler(async (req, res, next) => {
  const { params: { id }, body, user } = req;
  // const producer = req.app.get('submitProducer');
  body.problem = id;
  body.user = user.info;
  const submit = await Submit.create(body);
  await producingSubmit(producer, String(submit._id));
  await updateFilesByUrls(req, submit._id, 'Submit', [submit.source])
  res.json(createResponse(res, submit));
});


const createProblem = asyncHandler(async (req, res, next) => {
  const { body, user, body: {parentType, parentId} } = req;
  body.writer = user.info;
  body.ioSet = (body.ioSet || []).map(io => ({ inFile: io.inFile._id, outFile: io.outFile._id }));
  const parent = await parentModels[parentType].findById(parentId);
  const err = validateParentOf(body, parent);
  if (err) return next(err);
  const problem = await Problem.create(body);
  const urls = [body.content];
  const ids = [...body.ioSet.map(io => io.inFile), ...body.ioSet.map(io => io.outFile)];
  await Promise.all([
    updateFilesByUrls(req, problem._id, 'Problem', urls),
    updateFilesByIds(req, problem._id, 'Problem', ids)
  ]);
  if (parent) await assignTo(parent, problem);
  res.json(createResponse(res, doc));
});


const updateProblem = asyncHandler(async (req, res, next) => {
  const { params: { id }, body: $set, user} = req;
  const {err, problem} = validateByProblem(id);
  if (err) return next(err);
  $set.ioSet = ($set.ioSet || []).map(io => ({ inFile: io.inFile._id, outFile: io.outFile._id }));
  const urls = [$set.content]
  const ids = [...$set.ioSet.map(io => io.inFile), ...$set.ioSet.map(io => io.outFile)];
  await Promise.all([
    problem.updateOne({ $set }),
    updateFilesByUrls(req, problem._id, 'Problem', urls),
    updateFilesByIds(req, problem._id, 'Problem', ids),
  ]);
  res.json(createResponse(res));
});

const removeProblem = asyncHandler(async (req, res, next) => {
  const { params: { id }} = req;
  const {err, problem, problem: {parentId: parent}} = await validateByProblem(id);
  if (err) return next(err);
  if (parent) await removeProblemAt(parent, id);
  //if (!checkTestPeriodOf(parent)) return next(AFTER_TEST_START);
  const urls = [problem.content];
  const ids = [...problem.ioSet.map(io => io.inFile), ...problem.ioSet.map(io => io.outFile)];
  await Promise.all([
    problem.deleteOne(),
    removeFilesByUrls(req, urls),
    removeFilesByIds(req, ids),
  ]);
  res.json(createResponse(res));
});


exports.getProblems = getProblems;
exports.getProblem = getProblem;
exports.createProblem = createProblem;
exports.updateProblem = updateProblem;
exports.removeProblem = removeProblem;
exports.createSubmit = createSubmit;
