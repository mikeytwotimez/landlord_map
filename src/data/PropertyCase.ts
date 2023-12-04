export type PropertyCase = {
    apn: string
    caseNumber: string
    caseType: string
    councilDistrict: string
    censusTract: string
    totalUnits: number
    totalExemptionUnits: number
    address: string
    inspector: string
    caseManager: string
    regionalOffice: string
    description: string
    activity: {
        date: string
        status: string
    }[]
}