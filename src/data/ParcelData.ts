export type ParcelData = {
    type: "Feature"
    geometry: {
        type: "Polygon" | "MultiPolygon"
        coordinates: number[][][]
    }
    properties: {
        AIN: string
        CENTER_LAT: number
        CENTER_LON: number
        EffectiveY: string
        LegalDescr: string
        Roll_ImpVa: number
        Roll_LandV: number
        Shape_Area: number
        Shape_Leng: number
        SitusAddre: string
        SitusCity: string
        SitusDirec: string | null
        SitusFract: string | null
        SitusFullA: string
        SitusHouse: string
        SitusStree: string
        SitusUnit: string | null
        SitusZip: string
        SpatialCha: Date
        SQFTmain1: number
        TaxRateAre: string
        TaxRateCit: string
        UseCode: string
        YearBuilt1: string
    }
}