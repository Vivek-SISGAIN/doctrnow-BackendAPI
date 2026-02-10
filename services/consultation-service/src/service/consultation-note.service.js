const prisma = require('../prisma/prisma');

class ConsultationNoteService {
  /**
   * Create a new consultation note
   */
  async create(data) {
    const note = await prisma.consultationNote.create({
      data: {
        consultationId: data.consultationId,
        content: data.content,
        createdBy: data.createdBy
      }
    });

    return note;
  }

  /**
   * Find note by ID
   */
  async findById(id) {
    const note = await prisma.consultationNote.findUnique({
      where: { id }
    });

    return note;
  }

  /**
   * Find notes by consultation ID
   */
  async findByConsultationId(consultationId) {
    const notes = await prisma.consultationNote.findMany({
      where: { consultationId },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return notes;
  }

  /**
   * Update note
   */
  async update(id, data) {
    const note = await prisma.consultationNote.findUnique({
      where: { id }
    });

    if (!note) {
      throw new Error('Note not found');
    }

    const updateData = {};
    if (data.content !== undefined) updateData.content = data.content;

    const updated = await prisma.consultationNote.update({
      where: { id },
      data: updateData
    });

    return updated;
  }

  /**
   * Delete note
   */
  async delete(id) {
    const note = await prisma.consultationNote.findUnique({
      where: { id }
    });

    if (!note) {
      throw new Error('Note not found');
    }

    await prisma.consultationNote.delete({
      where: { id }
    });

    return { message: 'Note deleted successfully' };
  }

  /**
   * Save or update note (auto-save functionality)
   * If note exists for consultation, update it; otherwise create new
   */
  async saveOrUpdate(consultationId, content, createdBy) {
    // Find the latest note for this consultation
    const latestNote = await prisma.consultationNote.findFirst({
      where: { consultationId },
      orderBy: { createdAt: 'desc' }
    });

    // If note exists and was created recently (within last 5 minutes), update it
    // Otherwise create a new note
    if (latestNote && latestNote.createdBy === createdBy) {
      const timeDiff = Date.now() - new Date(latestNote.createdAt).getTime();
      const fiveMinutes = 5 * 60 * 1000;

      if (timeDiff < fiveMinutes) {
        // Update existing note
        return await prisma.consultationNote.update({
          where: { id: latestNote.id },
          data: { content }
        });
      }
    }

    // Create new note
    return await prisma.consultationNote.create({
      data: {
        consultationId,
        content,
        createdBy
      }
    });
  }
}

module.exports = new ConsultationNoteService();
