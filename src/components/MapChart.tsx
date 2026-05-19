import React, { memo, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup
} from "react-simple-maps";
import { isMatchingSearch } from '../lib/utils';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const MapContent = ({ geographies, customers, onCountryClick, setTooltipContent }: any) => {
  const countryCounts = useMemo(() => {
    const counts: Record<string, { name: string, count: number }> = {};
    geographies.forEach((geo: any) => {
      let searchName = geo.properties.name;
      if (searchName === "United States of America") searchName = "United States";
      
      const count = customers.filter((c: any) => 
        isMatchingSearch(searchName, c.name) || 
        (c.industry && isMatchingSearch(searchName, c.industry)) ||
        (c.address && isMatchingSearch(searchName, c.address)) ||
        (c.country && isMatchingSearch(searchName, c.country)) ||
        (c.province && isMatchingSearch(searchName, c.province)) ||
        (c.city && isMatchingSearch(searchName, c.city))
      ).length;
      counts[geo.rsmKey] = { name: searchName, count };
    });
    return counts;
  }, [geographies, customers]);

  return geographies.map((geo: any) => {
    const lookup = countryCounts[geo.rsmKey] || { name: geo.properties.name, count: 0 };
    const hasCustomers = lookup.count > 0;

    return (
      <Geography
        key={geo.rsmKey}
        geography={geo}
        onClick={() => onCountryClick(lookup.name)}
        onMouseEnter={() => {
          if (setTooltipContent) {
            setTooltipContent(`${lookup.name} - ${lookup.count} 个客户`);
          }
        }}
        onMouseLeave={() => {
          if (setTooltipContent) {
            setTooltipContent("");
          }
        }}
        style={{
          default: {
            fill: hasCustomers ? "#93c5fd" : "#D6D6DA", // Lighter blue for active, grey for empty
            outline: "none"
          },
          hover: {
            fill: hasCustomers ? "#3b82f6" : "#9ca3af", // Strong blue on hover if active
            outline: "none",
            cursor: hasCustomers ? "pointer" : "default"
          },
          pressed: {
            fill: "#2563eb",
            outline: "none"
          }
        }}
      />
    );
  });
};

const MapChart = ({ 
  setTooltipContent, 
  onCountryClick,
  customers = []
}: { 
  setTooltipContent?: (content: string) => void, 
  onCountryClick: (countryName: string) => void,
  customers?: any[]
}) => {
  return (
    <div className="w-full h-full bg-slate-50 border-slate-200 border rounded-lg">
      <ComposableMap data-tip="" projectionConfig={{ scale: 147 }} width={800} height={400} style={{ width: "100%", height: "100%" }}>
        <ZoomableGroup>
          <Geographies geography={geoUrl}>
            {({ geographies }) => (
              <MapContent 
                geographies={geographies} 
                customers={customers} 
                onCountryClick={onCountryClick} 
                setTooltipContent={setTooltipContent} 
              />
            )}
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
};

export default memo(MapChart);
