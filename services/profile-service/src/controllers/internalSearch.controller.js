const { searchSpecialties, searchDoctors } = require('../service/internalSearch.service');

exports.searchSpecialties = async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ success: false, data: [] });
    const data = await searchSpecialties(q, limit || 5);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Profile internalSearch error:', err);
    res.status(500).json({ success: false, data: [] });
  }
};

exports.searchDoctors = async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ success: false, data: [] });
    const data = await searchDoctors(q, limit || 5);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Profile internalSearch error:', err);
    res.status(500).json({ success: false, data: [] });
  }
};
