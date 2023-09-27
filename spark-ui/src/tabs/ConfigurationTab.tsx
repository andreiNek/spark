import * as React from 'react';
import Grid from '@mui/material/Grid';
import ConfigTable from '../components/ConfigTable';
import { AppStateContext } from '../Context';

export default function ConfigurationTab() {
  const { config } = React.useContext(AppStateContext);

  return (
    <Grid container spacing={3} sx={{ mt: 2, mb: 2 }} display="flex" justifyContent="center" alignItems="center">
      <Grid item xs={16} md={8} lg={6}>
        {!!config && <ConfigTable config={config} />}
      </Grid>
    </Grid>
  );
}