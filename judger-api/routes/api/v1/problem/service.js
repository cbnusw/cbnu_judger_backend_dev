const { SUBMIT_TOPIC: topic } = require('../../../../env');
const { refreshMetaData } = require("../../../../kafka");
exports.parentModels = {
  'Assignment': Assignment,
  'Contest': Contest,
}
exports.parentNotFoundErrors = {
  'Assignment': ASSIGNMENT_NOT_FOUND,
  'Contest': CONTEST_NOT_FOUND
}
exports.producingSubmit = (producer, submitId) => {
  refreshMetaData()
  const payloads = [{
    topic,
    messages: submitId
  }];

  return new Promise((resolve, reject) => {
    producer.send(payloads, (err, data) => {
      console.log(`::: ID ${payloads[0].messages} message sent :::::: partition info : ${payloads[0].partition}`)
      if (err) reject(err);
      else resolve(data);
    });
  });
};

exports.checkTestPeriodOf = ({testPeriod}) => {
  const now = new Date();
  const start = new Date(testPeriod.start);
  if (now.getTime() > start.getTime()) return false;
  return true;
}

exports.removeProblemAt = async (parent, problemId) => {
  const index = parent.problems.indexOf(problemId);
  if (index !== -1) {
    parent.problems.splice(index, 1);
    await parent.save();
  }
}

exports.assignTo = async (parent, problem) => {
  parent.problems.push(problem._id);
  await parent.save();
}
exports.validateParentOf = ({ writer: problemWriter, parentType, published }, parent) => {
  if (!parentType) return null;
  if (!parent) return parentNotFoundErrors[parentType];
  const { testPeriod } = parent;
  if (published) {
    const published = new Date(published);
    const end = new Date(testPeriod.end);
    if (published.getTime() < end.getTime()) return INVALID_PROBLEM_PUBLISH;
  }
  return null;
}


exports.validateByProblem = async (id) => {
  const problem = await Problem.findById(id).populate('parentId');
  if (!problem) return { err: PROBLEM_NOT_FOUND };
  const { parentId: parent } = problem;
  const err = validateParentOf(problem, parent);
  if (err) return { err };
  return { problem };
}

exports.checkOwnerOf = (target, user) => {
  if (String(target.writer) === String(user.info)) return true;
  return false
}


