import { Alert, Box, Divider } from "@mui/material";
import React, { FC } from "react";
import { useAppSelector } from "../Hooks";
import ConfigTable from "../components/ConfigTable";
import ResourceBar from "../components/ResourceBar";
import ResourceGraph, { DynamicResource, StaticResource } from "../components/ResourceGraph/ResourceGraph";

export const ResourcesTab: FC<{}> = (): JSX.Element => {
  const resourceControlType = useAppSelector((state) => state.spark.config?.resourceControlType) ?? "";

  if (resourceControlType === "local") {
    return <div
      style={{
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Alert severity="success">Local mode, no resource managment 😎</Alert>
    </div>

  }

  const executorTimeline = useAppSelector((state) => state.spark.executorTimeline);
  const configs = useAppSelector((state) => state.spark.config?.configs);

  const generalConfigs = configs?.filter(entry => entry.category === "resources") ?? [];
  const allocationConfigs = configs?.filter(entry => {
    if (resourceControlType === "static") {
      return entry.category === "static-allocation";
    }
    if (resourceControlType === "dynamic") {
      return entry.name !== "enabled" && (entry.category === "dynamic-allocation" || entry.category === "dynamic-allocation-advanced");
    }
    return false;
  }) ?? [];

  let resources: StaticResource | DynamicResource | undefined = undefined;
  if (resourceControlType === "static") {
    resources = {
      type: "static",
      instances: parseInt(allocationConfigs.find(entry => entry.key === "spark.executor.instances")?.value ?? "0")
    }
  }
  if (resourceControlType === "dynamic") {
    const minEntry = allocationConfigs.find(entry => entry.key === "spark.dynamicAllocation.minExecutors");
    const maxEntry = allocationConfigs.find(entry => entry.key === "spark.dynamicAllocation.maxExecutors");

    resources = {
      type: "dynamic",
      min: parseInt(minEntry?.value ?? minEntry?.default ?? "0"),
      max: maxEntry?.value === undefined ? undefined : parseInt(maxEntry.value)
    };
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        justifyContent: "center",
        margin: 10
      }}
    >
      <Box width="100%" >
        <ResourceBar />
        <Box width="100%">
          <Box margin="10px">
            <ResourceGraph data={executorTimeline ?? []} resources={resources} ></ResourceGraph>
          </Box>
          <Box margin="10px" display="flex" flexDirection="row" alignItems="flex-start">
            {generalConfigs.length !== 0 ? <ConfigTable config={generalConfigs} /> : undefined}
            <Divider sx={{ margin: 1 }}></Divider>
            {allocationConfigs.length !== 0 ? <ConfigTable config={allocationConfigs} /> : undefined}
          </Box>
        </Box>
      </Box>
    </div >
  )
};
