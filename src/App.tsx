import './App.css';
import { bitable, Selection, ITable, IAttachmentField } from "@lark-base-open/js-sdk";
import { Button, Divider, Image, Space, Typography, Toast, Spin, Form, Card, Tooltip } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback, } from 'react';
import imageCompression from 'browser-image-compression';
import { cloneDeep } from "lodash"
import { IconInfoCircle } from "@douyinfe/semi-icons"
import { formatFileSize } from './image';

// todo: 把form去掉,赋值慢,在获取field优化下

type ImageItem = {
  url: string;
  file: File;
  name: string;
  size: number;
  type: string; // mime
  token: string;
  timeStamp: number;
  recordId: string
  fieldId: string
}



type ImageRecordList = {
  fieldId: string
  recordId: string
  images: ImageItem[]
}




type Selected = {
  field: IAttachmentField
  selection: Selection
}


type SelectionChangeOptions = {
  data: Selection
}


export default function App() {


  // 图片列表
  const [imageRecordList, setImageRecordList] = useState<ImageRecordList[]>([])

  // 压缩比
  const [compressNum, setCompressNum] = useState<number>(10)

  const [pattern, setPattern] = useState<string>('cell')

  const [loading, setLoading] = useState<boolean>(false)
  // 当前table
  const tableRef = useRef<ITable | null>()
  // 选中的field
  const selectionFieldRef = useRef<IAttachmentField>()






  // 单击单元格获取图片
  const getData = async (event?: SelectionChangeOptions) => {


    setLoading(true)
    try {

      tableRef.current = await bitable.base.getActiveTable();

      let list = []
      let imgs: ImageRecordList[] = []

      let selection = await bitable.base.getSelection()


      const field = await tableRef.current?.getField<IAttachmentField>(selection?.fieldId as string) as IAttachmentField

      selectionFieldRef.current = field


      console.log(pattern)


      console.log(selection.fieldId)
      // console.log()


      //  根绝类型获取数据
      if (pattern === 'cell') {

        const arr = await field.getValue(selection?.recordId as string)

        list.push({
          recordId: selection.recordId as string,
          fieldId: selection.fieldId as string,
          images: arr
        })


      } else if (pattern === 'field') {

        const recordList = await tableRef.current.getRecordList();

        for (const record of recordList) {
          const cell = await record.getCellByField(selection.fieldId as string);
          const val = await cell.getValue();
          if (val) {
            list.push({
              recordId: record.id,
              fieldId: selection.fieldId as string,
              images: val
            })
          }
        }
      }

      console.log(list)

      if (list && list.length > 0) {

        for (let record of list) {
          const arr: ImageItem[] = []

          for (let img of record.images) {
            if (img.type.split('/')[0] === "image") {
              const url = await tableRef.current?.getAttachmentUrl(img.token) as string ?? ''
              const file = await fetchImageAsFile(url, img.name)
              const item = { ...img, file, url, recordId: selection.recordId, field: selection.fieldId }
              arr.push(item)
            }
          }

          imgs.push({
            recordId: record.recordId,
            fieldId: record.fieldId,
            images: arr
          })


        }
      } else {
        imgs = []
      }

      setImageRecordList(imgs)
      setLoading(false)

    } catch (e) {
      setLoading(false)
    }

  }

  const funRef = useRef(getData)




  useEffect(() => {
    init()
  }, []);


  // useEffect(() => {
  //   bitable.base.getSelection().then((res: Selection) => {
  //     getData({ data: res })
  //   })


  //   console.log(pattern)

  // }, [pattern])


  const init = async () => {
    try {
      bitable.base.onSelectionChange(()=>funRef.current());
    }
    catch (e) {
      console.log(e)
    }
  }




  // 压缩
  const handleCompress = async () => {
    setLoading(true)
    const list = cloneDeep(imageRecordList)

    for (const record of list) {
      const arr: ImageItem[] = []
      for (let item of record.images) {
        const file = await imageCompression(item.file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 1024,
          useWebWorker: true,
          initialQuality: (100 - compressNum) / 100,
          alwaysKeepResolution: true
        });

        arr.push({ ...item, file })

      }
      record.images = arr
    }

    setImageRecordList(list); // Update state with compressed images
    setLoading(false)
  };

  // 获取照片转File对象
  async function fetchImageAsFile(url: string, name: string): Promise<File> {
    // 使用 fetch 获取图片
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Network response was not ok.');
    }
    // 将响应转换为 Blob
    const blob = await response.blob();
    // 创建并返回 File 对象
    return new File([blob], name, { type: blob.type });
  }

  const confirmCompress = async () => {
    setLoading(true)
    try {
      // const res = await selectField?.field.setValue(selectField.selection.recordId as string, fileList)

      const resArr: boolean[] = []

      for (let item of imageRecordList) {
        const fileList = item.images.map(file => new File([file.file], file.name, { type: file.type }))
        const res = await selectionFieldRef.current?.setValue(item.recordId as string, fileList)
        resArr.push(res as boolean)
      }

      Toast.info(resArr.includes(false) ? "压缩失败!" : '应用成功!')
      setLoading(false)
    }
    catch (e) {
      setLoading(false)
      console.log(e)
    }

  }


  const ImageListEl = () => {

    return <Spin spinning={loading}>
      {
        loading ? null : imageRecordList.map(item => {
          return item.images.map(img => {
            return <Space vertical key={img.name}>
              <Image
                preview={false}
                width={100}
                height={100}
                src={img.url}
              />
              <Typography.Title heading={6} style={{ margin: '8px 0' }} >
                {formatFileSize(img.file.size)}
              </Typography.Title>
            </Space>
          })
        })

      }
    </Spin>


  }

  const judgeTip = (type: string) => {

    return {
      cell: '请先选择图片所在单元格',
      field: '请先选择图片所在列'
    }[type]

  }



  return (
    <main className="main" style={{}}>


      <Card  >

        <Form onValueChange={values => {
          console.log(values)
          setPattern(values.pattern as string)
          setCompressNum(values.compressNum as number)

        }} initValues={{ compressNum, pattern }}>
          <Form.Section text={'压缩设置'}>
            <Form.Slider max={100} min={1} field='compressNum' label={
              <Space>
                <span> 压缩粒度:{compressNum}</span>
                <Tooltip content={'压缩的粒度越大,压缩的图片越小'}>
                  <IconInfoCircle />

                </Tooltip>
              </Space>
            } />


            <Form.Select field='pattern' label="压缩模式">
              <Form.Select.Option value="cell">压缩当前选中单元格</Form.Select.Option>
              <Form.Select.Option value="field">压缩整列</Form.Select.Option>
            </Form.Select>

          </Form.Section>
        </Form>

        <Space>

          <Button disabled={imageRecordList.length === 0 || loading} theme='solid' onClick={handleCompress} >压缩</Button>
          <Button disabled={imageRecordList.length === 0 || loading} theme='solid' onClick={confirmCompress} >应用</Button>
        </Space>
      </Card>

      <Divider margin='12px' />


      {
        imageRecordList.length > 0 ? <ImageListEl /> : judgeTip(pattern)
      }

    </main>
  )
}

