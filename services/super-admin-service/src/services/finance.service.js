import prisma from "../prisma/client.js";

class FinanceService {
  async createFinance(data) {
    console.log("is this executed")
    const finance = await prisma.finance.create({
      data: {
        platformCommission: data.platformCommission,
        hospitalShare: data.hospitalShare,
        payoutFrequency: data.payoutFrequency,
        paymentMethod: data.paymentMethod,
        minPayoutThreshold: data.minPayoutThreshold,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        iban: data.iban,
        swiftCode: data.swiftCode,
        accountHolderName: data.accountHolderName,
        branchAddress: data.branchAddress,
        hospitalId: data.hospitalId
      }
    });
    return finance;
  }

  async getFinances() {
    return prisma.finance.findMany({
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async getFinanceById(id) {
    const finance = await prisma.finance.findUnique({
      where: { id }
    });

    if (!finance) {
      throw new Error("Finance not found");
    }

    return finance;
  }

  async getFinanceByHospitalId(hospitalId) {
    const finance = await prisma.finance.findUnique({
      where: { hospitalId }
    });

    if (!finance) {
      throw new Error("Finance not found for this hospital");
    }

    return finance;
  }

  async updateFinance(id, data) {
    const finance = await prisma.finance.update({
      where: { id },
      data
    });
    return finance;
  }

  async deleteFinance(id) {
    await prisma.finance.delete({
      where: { id }
    });

    return { message: "Finance deleted successfully" };
  }
}

export default new FinanceService();
