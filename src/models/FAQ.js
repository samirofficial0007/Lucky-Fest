const mongoose=require('mongoose');
const schema=new mongoose.Schema({question:{type:String,required:true},answer:{type:String,required:true},order:{type:Number,default:0},active:{type:Boolean,default:true}},{timestamps:true});
module.exports=mongoose.model('FAQ',schema);
