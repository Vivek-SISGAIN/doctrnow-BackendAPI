import { searchHospitals } from '../services/internalSearch.service.js';

export const searchHospitalsController = async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ success: false, data: [] });
    const data = await searchHospitals(q, limit || 5);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Superadmin internalSearch error:', err);
    res.status(500).json({ success: false, data: [] });
  }
};
