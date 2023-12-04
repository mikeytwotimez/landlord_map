import { PropertyCase } from "./PropertyCase"
import { Deed } from "./Deed"

export type Property = {
    apn: string
    address: string
    geometry: {
        type: "Polygon" | "MultiPolygon"
        coordinates: number[][][] | number[][][][]
    }
    yearBuilt: number
    effectiveYear: number
    deeds: Deed[]
    cases: PropertyCase[]
}