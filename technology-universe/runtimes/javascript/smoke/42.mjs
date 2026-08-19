import {configureStore,createSlice} from '@reduxjs/toolkit';
const sl=createSlice({name:'c',initialState:0,reducers:{inc:s=>s+1}});
const st=configureStore({reducer:sl.reducer});
st.dispatch(sl.actions.inc());
if(st.getState()!==1) throw new Error('bad');
console.log('ok');
